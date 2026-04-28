const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 

// 🟢 ВЕРСИЯ 14 - Обновленные кнопки старта
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/?v=14';

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(port);

const bot = new Telegraf(token);
const pendingOrders = new Map();

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
        }
    } catch (e) { console.error("Ошибка сбора базы:", e.message); }
}

bot.start(async (ctx) => {
    await collectUser(ctx);
    
    // 🟢 1. ДЕЛАЕМ КНОПКУ КАТАЛОГА ПОСТОЯННОЙ (Слева внизу возле ввода текста)
    try {
        await ctx.setChatMenuButton({
            type: 'web_app',
            text: '🛒 Каталог',
            web_app: { url: webAppUrl }
        });
    } catch (e) {
        console.error('Не удалось установить кнопку меню:', e.message);
    }

    // 🟢 2. ОТПРАВЛЯЕМ ПРИВЕТСТВИЕ С КРАСИВОЙ КНОПКОЙ ПРЯМО В ЧАТ
    ctx.reply(
        'Добро пожаловать в FORMA! 🛋\nВаш персональный гид в мире современной мебели.\n\nНажмите кнопку ниже, чтобы открыть наш магазин:', 
        Markup.inlineKeyboard([
            [Markup.button.webApp('🛒 ОТКРЫТЬ МАГАЗИН', webAppUrl)]
        ])
    );
});

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
            } catch (e) {}
        }
        ctx.reply(`✅ Рассылка завершена! Получили: ${count} чел.`);
    } catch (e) { ctx.reply("Ошибка рассылки: " + e.message); }
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.message.web_app_data.data);
        const amount = data.totalPrice || 0; 
        
        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        const orderId = `order_${Date.now()}`;
        pendingOrders.set(orderId, data);

        await ctx.replyWithInvoice({
            title: 'Оплата заказа FORMA',
            description: `Мебель: ${Object.keys(data.products).length} поз.`,
            payload: orderId,
            provider_token: PAYMENT_TOKEN,
            currency: 'USD',
            prices: [{ label: 'ИТОГО', amount: Math.round(amount * 100) }], 
            start_parameter: 'order-process'
        });
        
    } catch (e) {
        console.error("❌ ОШИБКА ИНВОЙСА:", e.message);
        ctx.reply("Ошибка при создании счета. Попробуйте еще раз.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const orderId = payment.invoice_payload;
        const userId = ctx.from.id;
        
        const orderData = pendingOrders.get(orderId) || {};
        const itemsStr = Object.entries(orderData.products || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const cPhone = orderData.customerPhone || "Не указан";
        const cDelivery = orderData.deliveryMethod || "Не указана";
        const cAddress = orderData.deliveryAddress || "Не указан";
        
        const tgName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя": tgName,
            "Телефон": cPhone,
            "Адрес": `${cDelivery} - ${cAddress}`,
            "Сумма ($)": payment.total_amount / 100,
            "Товары": itemsStr || "Товары",
            "ID пользователя": String(userId)
        };

        const doc = await getSheet();
        await doc.sheetsByIndex[0].addRow(rowData);
        await ctx.reply("✨ Оплата прошла успешно! Ожидайте подтверждения.");
        pendingOrders.delete(orderId);

        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
                             `👤 <b>Клиент:</b> ${tgName}\n` +
                             `📞 <b>Телефон:</b> ${cPhone}\n` +
                             `🚚 <b>Доставка:</b> ${cDelivery}\n` +
                             `📍 <b>Адрес/Гео:</b> ${cAddress}\n` +
                             `📦 <b>Товары:</b> ${itemsStr}\n` +
                             `💵 <b>Итого:</b> $ ${payment.total_amount / 100}`;
            
            await bot.telegram.sendMessage(ADMIN_ID, adminMsg, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Принять', `accept_${userId}`),
                        Markup.button.callback('❌ Отклонить', `reject_${userId}`)
                    ]
                ])
            });
        }
    } catch (e) { console.error("❌ ОШИБКА ПОСЛЕ ОПЛАТЫ:", e.message); }
});

bot.action(/accept_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    try {
        await bot.telegram.sendMessage(userId, "✅ <b>Ваш заказ принят в работу!</b>\nНаш менеджер скоро свяжется с вами.", { parse_mode: 'HTML' });
        await ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🟢 <b>СТАТУС: ПРИНЯТ</b>", { parse_mode: 'HTML' });
        await ctx.answerCbQuery("Заказ принят!");
    } catch (e) { await ctx.answerCbQuery("Ошибка отправки."); }
});

bot.action(/reject_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    try {
        await bot.telegram.sendMessage(userId, "❌ <b>К сожалению, ваш заказ отменен.</b>\nДеньги будут возвращены.", { parse_mode: 'HTML' });
        await ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🔴 <b>СТАТУС: ОТКЛОНЕН</b>", { parse_mode: 'HTML' });
        await ctx.answerCbQuery("Заказ отклонен.");
    } catch (e) { await ctx.answerCbQuery("Ошибка отправки."); }
});

bot.launch().then(() => console.log('🚀 Бот запущен (Версия 14)!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));