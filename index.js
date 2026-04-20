const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN не найден!");
    process.exit(1);
}

const bot = new Telegraf(token);

// 1. ФУНКЦИЯ ЗАПИСИ В ТАБЛИЦУ
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
        console.log("✅ Записано в Sheets");
    } catch (e) {
        console.error("❌ Ошибка Sheets:", e.message);
    }
}

// 2. ПРИЕМ ДАННЫХ (ИСПРАВЛЯЕТ [Функция: json])
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        const raw = ctx.webAppData.data;

        // Если это объект с функцией text(), вызываем её
        if (raw && typeof raw.text === 'function') {
            const rawText = await raw.text();
            data = JSON.parse(rawText);
        } else if (typeof raw === 'string') {
            data = JSON.parse(raw);
        } else {
            data = raw;
        }

        console.log("Данные успешно извлечены:", data);

        const totalAmount = Math.round(data.totalPrice || 0);
        if (totalAmount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят.`);

        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ',
            payload: JSON.stringify({ items: data.products || {} }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'mebel-order'
        });
    } catch (e) {
        console.error("Ошибка парсинга:", e.message);
        ctx.reply("Ошибка обработки корзины.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 3. ПОСЛЕ ОПЛАТЫ
bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name,
            "Адрес": "Приложение",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": JSON.stringify(payload.items),
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("🎉 Заказ сохранен в таблицу!");
    } catch (e) {
        console.error("Ошибка после оплаты:", e.message);
    }
});

// Запуск с защитой от ошибок
bot.launch().then(() => console.log('🚀 Бот запущен!'));

// Обязательно для Railway, чтобы не было Conflict 409
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
