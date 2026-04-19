const { Telegraf } = require('telegraf');

// 1. Токен бота
const bot = new Telegraf('8474220877:AAHmSXn0v-MRbWSZMAWGr16EYoPF1SXD3SQ');

// 2. Ссылка на Mini App
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

// 3. ТВОЙ ПЛАТЕЖНЫЙ ТОКЕН (из скриншота 30)
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
        await ctx.replyWithInvoice(
            'Оплата заказа мебели', 
            'Пожалуйста, оплатите ваш заказ для подтверждения доставки',
            'order_' + Date.now(), 
            PAYMENT_TOKEN,
            'UZS', 
            [{ label: 'Мебель', amount: totalAmount * 100 }] // Сумма в тийинах
        );

    } catch (e) {
        console.error("Ошибка платежа:", e);
        ctx.reply('❌ Ошибка при оформлении счета.');
    }
});

// ОБЯЗАТЕЛЬНО: Подтверждение готовности к оплате
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// Сообщение после успешной оплаты
bot.on('successful_payment', async (ctx) => {
    await ctx.reply('✅ Оплата прошла успешно! Мы начали сборку вашего заказа. Доставка по Ташкенту в течение дня.');
});

bot.launch();
console.log('Бот Shop_mebel запущен с приемом оплаты!');