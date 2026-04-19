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
        const data = JSON.parse(ctx.webAppData.data.text());
        const totalAmount = Math.round(data.totalPrice);

        if (!totalAmount || totalAmount <= 0) {
            return await ctx.reply('❌ Ошибка: Корзина пуста');
        }

        await ctx.reply(`✅ Заказ принят на сумму ${totalAmount} сум. Формирую чек...`);

        // Используем объект для передачи параметров - это самый надежный способ в Telegraf
        await ctx.replyWithInvoice({
            title: 'Оплата мебели',
            description: 'Заказ в магазине Mebel Shop',
            payload: `order_${Date.now()}`,
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [
                { label: 'Товары', amount: totalAmount * 100 }
            ],
            start_parameter: 'mebel-shop-order'
        });

    } catch (e) {
        console.error("Ошибка при создании счета:", e);
        await ctx.reply(`❌ Ошибка: ${e.message || 'Не удалось создать счет'}`);
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