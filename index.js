const { Telegraf } = require('telegraf');

// 1. Токен бота
const bot = new Telegraf('8474220877:AAHmSXn0v-MRbWSZMAWGr16EYoPF1SXD3SQ');

// 2. Ссылка на Mini App
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

// 3. Твой платежный токен (Smart Glocal Test)
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

bot.start((ctx) => {
    ctx.reply('Магазин мебели в Ташкенте открыт! Нажми кнопку:', {
        reply_markup: {
            keyboard: [
                [{ text: "🛒 Открыть каталог", web_app: { url: webAppUrl } }]
            ],
            resize_keyboard: true
        }
    });
});

// ОБЯЗАТЕЛЬНО: async перед (ctx)
bot.on('web_app_data', async (ctx) => {
    try {
        const rawData = ctx.webAppData.data.text();
        const data = JSON.parse(rawData);
        const totalAmount = Math.round(data.totalPrice);

        // 1. Сначала подтверждаем получение данных
        await ctx.reply(`📦 Заказ принят! Сумма: ${totalAmount} сум. Готовлю счет...`);

        // 2. Выставляем счет (Invoice)
        // ВАЖНО: Используем именованные параметры для Telegraf или строгий порядок
        await ctx.replyWithInvoice(
            'Оплата заказа мебели',          // 1. Title (обязательно)
            'Ваш заказ в магазине Mebel Shop',// 2. Description (обязательно)
            `order_${Date.now()}`,           // 3. Payload (уникальный ID)
            PAYMENT_TOKEN,                   // 4. Токен: 1877036958:TEST:...
            'UZS',                           // 5. Валюта
            [{ label: 'К оплате', amount: totalAmount * 100 }] // 6. Цена (в тийинах)
        );

    } catch (e) {
        console.error("Ошибка API:", e);
        ctx.reply(`❌ Ошибка: ${e.message}`);
    }
});
// Подтверждение перед оплатой
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// После успешной оплаты
bot.on('successful_payment', async (ctx) => {
    await ctx.reply('✅ Оплата прошла успешно! Спасибо за покупку. Доставка по Ташкенту скоро свяжется с вами.');
});

bot.launch();
console.log('Бот запущен корректно!');