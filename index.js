const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. НАСТРОЙКИ
const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN не задан!");
    process.exit(1);
}

const bot = new Telegraf(token);

// 2. ФУНКЦИЯ ЗАПИСИ (Теперь она точно определена)
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
        console.log("✅ Данные успешно отправлены в Google Sheets");
    } catch (e) {
        console.error("❌ Ошибка внутри функции saveOrderToSheets:", e.message);
        throw e;
    }
}

// 3. ПРИЕМ ДАННЫХ ИЗ MINI APP
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        const rawData = ctx.webAppData.data;
        
        // Исправляем проблему парсинга со Screenshot_11
        data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        console.log("Данные заказа получены:", data);

        const totalAmount = Math.round(data.totalPrice || 0);
        
        if (totalAmount <= 0) {
            return ctx.reply('Ошибка: сумма заказа не определена в корзине.');
        }

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят. Формирую счет...`);

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
        console.error("Ошибка при обработке заказа:", e.message);
        ctx.reply("Произошла ошибка при формировании счета.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 4. ОБРАБОТКА ПОСЛЕ ОПЛАТЫ
bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);
        
        const items = orderInfo.items || {};
        const itemsString = Object.entries(items)
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        // Соответствие колонкам со Screenshot_14
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Из приложения", 
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsString || "Мебель",
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("🎉 Оплата прошла! Данные сохранены в таблицу.");
    } catch (error) {
        console.error("❌ ОШИБКА ПРИ ЗАПИСИ:", error.message);
    }
});

// Запуск с защитой от дублей
bot.launch().then(() => console.log('🚀 Бот запущен!'));

// Остановка бота при перезагрузке сервера
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));