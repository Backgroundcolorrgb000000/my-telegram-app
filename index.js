const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 

// 🟢 ВЕРСИЯ 20 - Пропуск локации и умный адрес
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/?v=20';

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
        if (!sheet) { sheet = await doc.addSheet({ title: "Пользователи", headerValues: ["ID", "Имя", "Username"] }); }
        const rows = await sheet.getRows();
        if (!rows.find(r => r.get("ID") == ctx.from.id)) {
            await sheet.addRow({ ID: String(ctx.from.id), Имя: ctx.from.first_name, Username: ctx.from.username || "" });
        }
    } catch (e) { console.error("Ошибка сбора базы:", e.message); }
}

bot.start(async (ctx) => {
    await collectUser(ctx);
    try { await ctx.setChatMenuButton({ type: 'default' }); } catch (e) {}
    ctx.reply('Добро пожаловать в FORMA! 🛋\nИспользуйте кнопку ниже для входа в каталог.', Markup.keyboard([[Markup.button.webApp('🛒 КАТАЛОГ ТОВАРОВ', webAppUrl)]]).resize());
});

bot.command('send', async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const msg = ctx.message.text.replace('/send', '').trim();
    if (!msg) return ctx.reply('Использование: /send Текст сообщения');
    try {
        const doc = await getSheet();
        const rows = await doc.sheetsByTitle["Пользователи"].getRows();
        let count = 0;
        ctx.reply(`📢 Начинаю рассылку...`);
        for (const row of rows) { try { await bot.telegram.sendMessage(row.get("ID"), msg); count++; } catch (e) {} }
        ctx.reply(`✅ Рассылка завершена! Получили: ${count} чел.`);
    } catch (e) { ctx.reply("Ошибка рассылки: " + e.message); }
});

// 🟢 ОБРАБОТКА ДАННЫХ ИЗ КОРЗИНЫ
bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.message.web_app_data.data);
        const amount = data.totalPrice || 0; 
        const orderId = `order_${Date.now()}`;
        data.orderId = orderId; 

        if (data.deliveryMethod.includes("Самовывоз")) {
            pendingOrders.set(orderId, data);
            await sendInvoice(ctx, orderId, amount, data);
        } else {
            pendingOrders.set(ctx.from.id, data); 
            // Подсказываем клиенту, что карту можно двигать пальцем, или пропустить шаг
            await ctx.reply(
                '📍 Отправьте геолокацию доставки.\n\n💡 *Подсказка:* При открытии карты вы можете пальцем переместить точку в любое нужное вам место!\n\nЕсли вы уже написали точный адрес вручную и карта не нужна, нажмите «Пропустить».',
                Markup.keyboard([
                    [Markup.button.locationRequest('📍 Выбрать точку на карте')],
                    ['➡️ Пропустить шаг с картой'],
                    ['❌ Отмена заказа']
                ]).resize().oneTime()
            );
        }
    } catch (e) { console.error("❌ ОШИБКА:", e.message); }
});

// 🟢 ЕСЛИ КЛИЕНТ ОТПРАВИЛ ЛОКАЦИЮ
bot.on('location', async (ctx) => {
    const userId = ctx.from.id;
    const orderData = pendingOrders.get(userId);
    if (!orderData) return;

    const lat = ctx.message.location.latitude;
    const lon = ctx.message.location.longitude;
    orderData.mapLink = `https://www.google.com/maps?q=${lat},${lon}`;

    pendingOrders.delete(userId);
    pendingOrders.set(orderData.orderId, orderData);

    await ctx.reply('✅ Локация получена! Формирую счет...', Markup.keyboard([[Markup.button.webApp('🛒 КАТАЛОГ ТОВАРОВ', webAppUrl)]]).resize());
    await sendInvoice(ctx, orderData.orderId, orderData.totalPrice, orderData);
});

// 🟢 ЕСЛИ КЛИЕНТ НАЖАЛ "ПРОПУСТИТЬ"
bot.hears('➡️ Пропустить шаг с картой', async (ctx) => {
    const userId = ctx.from.id;
    const orderData = pendingOrders.get(userId);
    if (!orderData) return;

    orderData.mapLink = "Не указана (введен текст)";
    
    pendingOrders.delete(userId);
    pendingOrders.set(orderData.orderId, orderData);

    await ctx.reply('✅ Переходим к оплате...', Markup.keyboard([[Markup.button.webApp('🛒 КАТАЛОГ ТОВАРОВ', webAppUrl)]]).resize());
    await sendInvoice(ctx, orderData.orderId, orderData.totalPrice, orderData);
});

bot.hears('❌ Отмена заказа', async (ctx) => {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('Заказ отменен.', Markup.keyboard([[Markup.button.webApp('🛒 КАТАЛОГ ТОВАРОВ', webAppUrl)]]).resize());
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const orderId = payment.invoice_payload;
        const userId = ctx.from.id;
        const orderData = pendingOrders.get(orderId) || {};
        
        const itemsStr = Object.entries(orderData.products || {}).map(([id, qty]) => `${id} (${qty}шт)`).join(', ');
        const tgName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
        const safePhone = orderData.customerPhone ? "'" + orderData.customerPhone : "'Не указан";
        
        // Формируем красивый адрес без лишней грязи
        const manualAddr = orderData.deliveryAddressText ? `Адрес: ${orderData.deliveryAddressText}` : "";
        const note = orderData.deliveryNote ? `Примечание: ${orderData.deliveryNote}` : "";
        
        const fullAddressParts = [orderData.deliveryMethod];
        if (manualAddr) fullAddressParts.push(manualAddr);
        if (note) fullAddressParts.push(note);
        const fullAddress = fullAddressParts.join('. ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя": tgName,
            "Телефон": safePhone,
            "Адрес": fullAddress,
            "Локация": orderData.mapLink || "Нет",
            "Сумма ($)": payment.total_amount / 100,
            "Товары": itemsStr || "Товары",
            "ID пользователя": String(userId)
        };

        const doc = await getSheet();
        await doc.sheetsByIndex[0].addRow(rowData);
        await ctx.reply("✨ Оплата прошла успешно! Ваш заказ в обработке.");
        pendingOrders.delete(orderId);

        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
                             `👤 <b>Клиент:</b> ${tgName}\n` +
                             `📞 <b>Телефон:</b> ${orderData.customerPhone}\n` +
                             `🚚 <b>Тип:</b> ${orderData.deliveryMethod}\n` +
                             `🏠 <b>Введенный адрес:</b> ${orderData.deliveryAddressText || 'Нет'}\n` +
                             `📝 <b>Примечание:</b> ${orderData.deliveryNote || 'Нет'}\n` +
                             `📍 <b>Локация:</b> ${orderData.mapLink || 'Самовывоз'}\n` +
                             `📦 <b>Товары:</b> ${itemsStr}\n` +
                             `💵 <b>Итого:</b> $ ${payment.total_amount / 100}`;
            
            await bot.telegram.sendMessage(ADMIN_ID, adminMsg, { 
                parse_mode: 'HTML', disable_web_page_preview: true,
                ...Markup.inlineKeyboard([[Markup.button.callback('✅ Принять', `accept_${userId}`), Markup.button.callback('❌ Отклонить', `reject_${userId}`)]])
            });
        }
    } catch (e) { console.error("❌ ОШИБКА ПОСЛЕ ОПЛАТЫ:", e.message); }
});

bot.action(/accept_(.+)/, async (ctx) => {
    try { await bot.telegram.sendMessage(ctx.match[1], "✅ <b>Ваш заказ принят в работу!</b>\nНаш менеджер скоро свяжется с вами.", { parse_mode: 'HTML' }); await ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🟢 <b>СТАТУС: ПРИНЯТ</b>", { parse_mode: 'HTML' }); await ctx.answerCbQuery("Заказ принят!"); } catch (e) {}
});

bot.action(/reject_(.+)/, async (ctx) => {
    try { await bot.telegram.sendMessage(ctx.match[1], "❌ <b>К сожалению, ваш заказ отменен.</b>", { parse_mode: 'HTML' }); await ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🔴 <b>СТАТУС: ОТКЛОНЕН</b>", { parse_mode: 'HTML' }); await ctx.answerCbQuery("Заказ отклонен."); } catch (e) {}
});

// Вынес отправку счета в отдельную функцию для чистоты кода
async function sendInvoice(ctx, orderId, amount, data) {
    await ctx.replyWithInvoice({
        title: 'Оплата заказа FORMA',
        description: `Мебель: ${Object.keys(data.products).length} поз.`,
        payload: orderId,
        provider_token: PAYMENT_TOKEN,
        currency: 'USD',
        prices: [{ label: 'ИТОГО', amount: Math.round(amount * 100) }], 
        start_parameter: 'order-process'
    });
}

bot.launch().then(() => console.log('🚀 Бот запущен (Версия 20 - Умная локация)!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));