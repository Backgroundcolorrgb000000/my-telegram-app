const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

// 1. СЕРВЕР ДЛЯ RAILWAY
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(port);

const bot = new Telegraf(token);

async function saveOrderToSheets(rowData) {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        await doc.sheetsByIndex[0].addRow(rowData);
        console.log("✅ Запись в Google Sheets");
    } catch (e) {
        console.error("❌ Таблица:", e.message);
    }
}

bot.start((ctx) => {
    ctx.reply('Магазин мебели FORMA готов!', 
        Markup.keyboard([[Markup.button.webApp('🛒 Открыть каталог', webAppUrl)]]).resize()
    );
});

// ИСПРАВЛЕННЫЙ ПРИЕМ ДАННЫХ
bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data.json());
        const amount = Math.round(data.totalPrice || 0); 
        
        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа',
            payload: JSON.stringify({ items: data.products }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }], 
            start_parameter: 'order-process'
        });
    } catch (e) {
        console.error("❌ Инвойс:", e.message);
        ctx.reply("Ошибка платежа. Попробуйте еще раз.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        const itemsStr = Object.entries(payload.items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Заказ из Mini App",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsStr,
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("✨ Оплата прошла успешно!");

        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n` +
                             `👤 <b>Клиент:</b> ${ctx.from.first_name}\n` +
                             `📦 <b>Товары:</b> ${itemsStr}\n` +
                             `💵 <b>Сумма:</b> ${(payment.total_amount / 100).toLocaleString()} сум`;
            await bot.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
        }
    } catch (e) {
        console.error("❌ Успешная оплата:", e.message);
    }
});

bot.launch().then(() => console.log('🚀 Бот в эфире!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));