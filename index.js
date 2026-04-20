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
        const rawData = ctx.webAppData.data;

        // ЛОГИКА ДЛЯ ИСПРАВЛЕНИЯ [Function: json]
        // Если данные пришли в специальном формате Telegraf
        if (rawData && typeof rawData.text === 'function') {
            const textData = await rawData.text();
            data = JSON.parse(textData);
        } else if (typeof rawData === 'string') {
            data = JSON.parse(rawData);
        } else {
            data = rawData;
        }

        console.log("Данные успешно распакованы:", data);

        // Проверяем цену (используем ключи из вашего Mini App)
        const totalAmount = Math.round(data.totalPrice || 0);

        if (totalAmount <= 0) {
            console.error("Ошибка: сумма 0 или не найдена в", data);
            return ctx.reply('Ошибка: не удалось определить стоимость товаров.');
        }

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят.`);

        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ из каталога',
            payload: JSON.stringify({
                userId: ctx.from.id,
                items: data.products || {}
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'mebel-order'
        });

    } catch (e) {
        console.error("Критическая ошибка парсинга:", e.message);
        ctx.reply("Ошибка при обработке данных из корзины. Попробуйте еще раз.");
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
