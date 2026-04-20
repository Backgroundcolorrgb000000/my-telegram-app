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
    await ctx.reply('🎉 Оплата прошла успешно! Мы скоро свяжемся с вами.');
    // Здесь можно вызвать saveOrderToSheets
});

bot.launch().then(() => console.log('🚀 Бот работает, инвойсы исправлены!'));