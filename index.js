const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Берем переменные строго из Railway
const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN отсутствует в Railway Variables!");
    process.exit(1);
}

const bot = new Telegraf(token);

// Блок получения данных из Mini App (ИСПРАВЛЕННЫЙ)
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        // Проверка: строка это или уже объект (решает проблему [object Object])
        if (typeof ctx.webAppData.data === 'string') {
            data = JSON.parse(ctx.webAppData.data);
        } else if (ctx.webAppData.data.text) {
            data = JSON.parse(ctx.webAppData.data.text());
        } else {
            data = ctx.webAppData.data;
        }

        console.log("Данные заказа получены:", data);

        const totalAmount = Math.round(data.totalPrice || 0);
        if (totalAmount <= 0) return ctx.reply('Ошибка: корзина пуста или цена не определена.');

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят. Формирую счет для оплаты...`);

        // Выставление счета
        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ из каталога',
            payload: JSON.stringify({
                userId: ctx.from.id,
                items: data.products
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }], // Суммы в Telegram * 100
            start_parameter: 'mebel-order'
        });

    } catch (e) {
        console.error("Критическая ошибка инвойса:", e.message);
        ctx.reply("Произошла ошибка при обработке заказа. Попробуйте еще раз.");
    }
});

// Эти два обработчика ОБЯЗАТЕЛЬНЫ для работы платежей
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    console.log("=== ОБНАРУЖЕН ПЛАТЕЖ ==="); // Вы увидите это в логах Railway
    
    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);
        
        // Формируем список товаров из объекта products
        const items = orderInfo.items || {};
        const itemsString = Object.entries(items)
            .map(([id, qty]) => `${id}: ${qty}`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsString || "Товар не указан",
            "ID пользователя": String(ctx.from.id)
        };

        console.log("Попытка записи в Google Sheets:", rowData);

        // ВАЖНО: Проверьте, что в saveOrderToSheets ключи совпадают с колонками в таблице!
        await saveOrderToSheets(rowData);
        
        console.log("✅ ЗАПИСЬ В ТАБЛИЦУ ВЫПОЛНЕНА");
        await ctx.reply("🎉 Спасибо! Ваш заказ сохранен в таблицу.");

    } catch (error) {
        console.error("❌ ОШИБКА ПРИ ЗАПИСИ ЗАКАЗА:", error.message);
        // Если здесь будет ошибка, вы увидите её в логах Railway красным цветом
    }
});

bot.launch().then(() => console.log('🚀 Бот работает, инвойсы исправлены!'));