const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 

// Версия v=8 для обновления дизайна
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/?v=8';

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(port);

const bot = new Telegraf(token);
const pendingOrders = new Map();

// Функция работы с Google Таблицей
async function getSheet() {
    const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    return doc;
}

// 🟢 НОВОЕ: Сбор базы пользователей для рассылки
async function collectUser(ctx) {
    try {
        const doc = await getSheet();
        let sheet = doc.sheetsByTitle["Пользователи"];
        if (!sheet) {
            sheet = await doc.addSheet({ title: "Пользователи", headerValues: ["ID", "Имя", "Username"] });
        }
        const rows = await sheet.getRows();
        if (!rows.find(r => r.get("ID") == ctx.from.id)) {
            await sheet.addRow({ ID: String(ctx.from.id), Имя: ctx.from.first_name, Username: ctx.from.username || "" });
            console.log("👤 Новый пользователь добавлен в базу");
        }
    } catch (e) { console.error("Ошибка сбора базы:", e.message); }
}

bot.start(async (ctx) => {
    await collectUser(ctx);
    ctx.reply('Добро пожаловать в FORMA! 🛋\nВаш персональный гид в мире современной мебели.', 
        Markup.keyboard([[Markup.button.webApp('🛒 КАТАЛОГ ТОВАРОВ', webAppUrl)]]).resize()
    );
});

// 🟢 НОВОЕ: Функция рассылки для Админа
bot.command('send', async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const msg = ctx.message.text.replace('/send', '').trim();
    if (!msg) return ctx.reply('Использование: /send Текст сообщения');

    try {
        const doc = await getSheet();
        const sheet = doc.sheetsByTitle["Пользователи"];
        const rows = await sheet.getRows();
        let count = 0;

        ctx.reply(`📢 Начинаю рассылку на ${rows.length} чел...`);

        for (const row of rows) {
            try {
                await bot.telegram.sendMessage(row.get("ID"), msg);
                count++;
            } catch (e) { console.log(`Не удалось отправить пользователю ${row.get("ID")}`); }
        }
        ctx.reply(`✅ Рассылка завершена! Получили: ${count} чел.`);
    } catch (e) { ctx.reply("Ошибка рассылки: " + e.message); }
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.message.web_app_data.data);
        const orderId = `order_${Date.now()}`;
        pendingOrders.set(orderId, data);

        await ctx.replyWithInvoice({
            title: 'Оплата заказа FORMA',
            description: `Мебель: ${Object.keys(data.products).length} поз.`,
            payload: orderId,
            provider_token: PAYMENT_TOKEN,
            currency: 'USD',
            prices: [{ label: 'ИТОГО', amount: Math.round(data.totalPrice * 100) }], 
            start_parameter: 'order-process'
        });
    } catch (e) { ctx.reply("Ошибка оформления счета."); }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const orderData = pendingOrders.get(payment.invoice_payload);
        if (!orderData) return;

        const doc = await getSheet();
        const sheet = doc.sheetsByIndex[0];
        
        const itemsStr = Object.entries(orderData.products).map(([id, qty]) => `${id} x${qty}`).join(', ');

        await sheet.addRow({
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": `${orderData.customerName} (${orderData.customerPhone})`,
            "Адрес": `${orderData.deliveryMethod}: ${orderData.deliveryAddress}`,
            "Сумма ($)": payment.total_amount / 100,
            "Товары": itemsStr,
            "ID пользователя": String(ctx.from.id)
        });

        await ctx.reply("✨ Оплата принята! Мы уже начали готовить ваш заказ.");
        pendingOrders.delete(payment.invoice_payload);

        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
                             `👤 <b>Клиент:</b> ${orderData.customerName}\n` +
                             `📞 <b>Тел:</b> ${orderData.customerPhone}\n` +
                             `🚚 <b>Доставка:</b> ${orderData.deliveryMethod}\n` +
                             `📍 <b>Адрес:</b> ${orderData.deliveryAddress}\n` +
                             `📦 <b>Товары:</b> ${itemsStr}\n` +
                             `💵 <b>Итого:</b> $ ${payment.total_amount / 100}`;
            
            await bot.telegram.sendMessage(ADMIN_ID, adminMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[
                    Markup.button.callback('✅ Принять', `accept_${ctx.from.id}`),
                    Markup.button.callback('❌ Отмена', `reject_${ctx.from.id}`)
                ]])
            });
        }
    } catch (e) { console.error("Ошибка после оплаты:", e.message); }
});

bot.action(/accept_(.+)/, async (ctx) => {
    await bot.telegram.sendMessage(ctx.match[1], "✅ Ваш заказ подтвержден и передан в службу доставки!");
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🟢 <b>ПРИНЯТ</b>", { parse_mode: 'HTML' });
});

bot.action(/reject_(.+)/, async (ctx) => {
    await bot.telegram.sendMessage(ctx.match[1], "❌ К сожалению, мы отменили ваш заказ. Деньги вернутся на карту.");
    ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🔴 <b>ОТКЛОНЕН</b>", { parse_mode: 'HTML' });
});

bot.launch();