const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. ПЕРЕМЕННЫЕ
const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN отсутствует в Railway Variables!");
    process.exit(1);
}

const bot = new Telegraf(token);

// 2. ФУНКЦИЯ ЗАПИСИ
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

// 3. ОБРАБОТКА ДАННЫХ ИЗ MINI APP
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        const rawData = ctx.webAppData.data;

        // Проверяем тип данных, чтобы не было ошибки [object Object]
        if (typeof rawData === 'string') {
            data = JSON.parse(rawData);
        } else if (rawData && typeof rawData.text === 'function') {
            data = JSON.parse(rawData.text());
        } else {
            data = rawData;
        }

        console.log("Данные заказа получены:", data);

        // Извлекаем цену (учитываем возможные варианты названий из вашего JS)
        const totalAmount = Math.round(data.totalPrice || data.total_price || 0);
        
        if (totalAmount <= 0) {
            console.log("Корзина пуста или цена 0:", data);
            return ctx.reply('Ошибка: корзина пуста.');
        }

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят. Формирую счет...`);

        // Выставляем инвойс
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
        console.error("Критическая ошибка при получении данных:", e.message);
        ctx.reply("Произошла ошибка при обработке данных заказа.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 4. ПОСЛЕ УСПЕШНОЙ ОПЛАТЫ
bot.on('successful_payment', async (ctx) => {
    console.log("=== ОБНАРУЖЕН ПЛАТЕЖ ===");
    
    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);
        
        const items = orderInfo.items || {};
        const itemsString = Object.entries(items)
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        // СТРОГО под колонки из вашего Screenshot_14
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Самовывоз/Из приложения", // Добавили колонку "Адрес" из вашей таблицы
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsString || "Заказ мебели",
            "ID пользователя": String(ctx.from.id)
        };

        console.log("Попытка записи в таблицу:", rowData);

        await saveOrderToSheets(rowData);
        
        console.log("✅ ЗАПИСЬ В ТАБЛИЦУ ВЫПОЛНЕНА");
        await ctx.reply("🎉 Спасибо! Данные сохранены в таблицу.");

    } catch (error) {
        console.error("❌ ОШИБКА ПРИ ЗАПИСИ ЗАКАЗА:", error.message);
    }
});

bot.launch().then(() => console.log('🚀 Бот запущен!'));