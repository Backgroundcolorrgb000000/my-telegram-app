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

        // Формируем текст сообщения
        let report = `📦 **Новый заказ!**\n`;
        report += `👤 **Клиент:** ${data.customerName || 'Не указано'}\n`;
        report += `📍 **Адрес:** ${data.customerAddress || 'Не указано'}\n\n`;

        const names = { 
            'sofa': 'Стильный диван', 
            'chair': 'Мягкое кресло', 
            'table': 'Обеденный стол' 
        };

        for (const [id, count] of Object.entries(data.products)) {
            if (count > 0) {
                report += `▫️ **${names[id] || id}**: ${count} шт.\n`;
            }
        }
        report += `\n💰 **Итого к оплате:** ${totalAmount} сум.`;

        // 1. Отправляем отчет
        await ctx.reply(report, { parse_mode: 'Markdown' });

        // 2. Выставляем счет (Invoice)
        // Здесь были ошибки с параметрами, теперь всё на своих местах
        await ctx.replyWithInvoice(
            'Оплата заказа мебели',          // Title
            'Заказ в магазине Mebel Shop',    // Description
            `inv_${Date.now()}`,             // Payload (уникальный ID)
            PAYMENT_TOKEN,                   // Token
            'UZS',                           // Currency (Узбекский сум)
            [{ label: 'Товары', amount: totalAmount * 100 }] // Цена (сумы * 100 для тийинов)
        ).catch(err => {
            console.error("Ошибка при отправке инвойса:", err);
            ctx.reply(`❌ Ошибка выставления счета: ${err.message}`);
        });

    } catch (e) {
        console.error("Общая ошибка:", e);
        ctx.reply('❌ Произошла ошибка при обработке данных.');
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