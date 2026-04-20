const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

const bot = new Telegraf(token);

// 1. ФУНКЦИЯ ЗАПИСИ
async function saveOrderToSheets(rowData) {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow(rowData);
    } catch (e) {
        console.error("Ошибка записи:", e.message);
        throw e;
    }
}

// 2. ОБРАБОТКА ДАННЫХ (ИСПРАВЛЕНО)
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        const raw = ctx.webAppData.data;

        // Если пришла строка, парсим её
        if (typeof raw === 'string') {
            data = JSON.parse(raw);
        } 
        // Если пришел объект с методами (как на Screenshot_8)
        else if (raw && typeof raw.text === 'function') {
            data = JSON.parse(await raw.text());
        } else {
            data = raw;
        }

        console.log("Данные извлечены:", data);

        const totalAmount = Math.round(data.totalPrice || 0);
        
        if (totalAmount <= 0) {
            return ctx.reply('Ошибка: сумма заказа не определена в корзине.');
        }

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят.`);

        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ',
            payload: JSON.stringify({ items: data.products || {} }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'order'
        });
    } catch (e) {
        console.error("Сбой парсинга:", e.message);
        ctx.reply("Ошибка обработки данных из корзины.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name,
            "Адрес": "Приложение", // Колонка С в таблице
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": JSON.stringify(payload.items),
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("🚀 Оплачено! Данные в таблице.");
    } catch (e) {
        console.error("Ошибка после оплаты:", e.message);
    }
});

bot.launch().catch(err => console.error("Ошибка запуска:", err));
