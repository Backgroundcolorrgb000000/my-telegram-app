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

        // 1. Сначала отправляем текстовый отчет о заказе
        let report = `📦 **Новый заказ!**\n`;
        report += `👤 **Клиент:** ${data.customerName || 'Не указано'}\n`;
        report += `📍 **Адрес:** ${data.customerAddress || 'Не указано'}\n\n`;
        
        const names = { 'sofa': 'Стильный диван', 'chair': 'Мягкое кресло', 'table': 'Обеденный стол' };
        for (const [id, count] of Object.entries(data.products)) {
            if (count > 0) report += `▫️ **${names[id] || id}**: ${count} шт.\n`;
        }
        report += `\n💰 **Итого к оплате:** ${totalAmount} сум.`;

        await ctx.reply(report, { parse_mode: 'Markdown' });

        // 2. Выставляем счет (Invoice)
        // ВАЖНО: Соблюдаем строгий порядок параметров
        await ctx.replyWithInvoice(
            'Оплата мебели в Mebel Shop',    // 1. title (ОБЯЗАТЕЛЬНО)
            'Ваш заказ успешно оформлен',    // 2. description (ОБЯЗАТЕЛЬНО)
            `inv_${Date.now()}`,             // 3. payload (уникальный ID)
            PAYMENT_TOKEN,                   // 4. provider_token
            'UZS',                           // 5. currency (валюта)
            [{ label: 'Мебель', amount: totalAmount * 100 }] // 6. prices (сумма в тийинах)
        );

    } catch (e) {
        console.error("Ошибка при обработке заказа:", e);
        // Выводим детальную ошибку прямо в чат для отладки
        ctx.reply(`❌ Ошибка выставления счета: ${e.description || e.message}`);
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