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

// Обработка данных из Mini App (нажатие кнопки «Оформить заказ»)
bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data.text());
        const totalAmount = Math.round(data.totalPrice);

        if (!totalAmount || totalAmount <= 0) {
            return await ctx.reply('❌ Ошибка: Корзина пуста');
        }

        await ctx.reply(`✅ Заказ принят на сумму ${totalAmount} сум. Формирую чек...`);

        // Выставление счета
        await ctx.replyWithInvoice({
            title: 'Оплата мебели',
            description: 'Заказ в магазине Mebel Shop',
            payload: `order_${Date.now()}`,
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [
                { label: 'Товары', amount: totalAmount * 100 } // Сумма в тийинах
            ],
            start_parameter: 'mebel-shop-order'
        });

    } catch (e) {
        console.error("Ошибка при создании счета:", e);
        await ctx.reply(`❌ Ошибка: ${e.message || 'Не удалось создать счет'}`);
    }
});

// 1. ОБЯЗАТЕЛЬНО: Подтверждение готовности принять платеж
bot.on('pre_checkout_query', (ctx) => {
    ctx.answerPreCheckoutQuery(true).catch(err => {
        console.error("Ошибка pre_checkout:", err);
    });
});

// 2. ОБЯЗАТЕЛЬНО: Действие после успешной оплаты
bot.on('successful_payment', async (ctx) => {
    await ctx.reply('✅ Оплата прошла успешно! Спасибо за покупку. Наша служба доставки скоро свяжется с вами.');
    console.log("Платеж получен:", ctx.message.successful_payment);
});

bot.launch().then(() => {
    console.log('Бот Shop_mebel запущен с приемом оплаты!');
});

// Мягкая остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));