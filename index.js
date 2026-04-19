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

// Замени блок bot.on('web_app_data', ...) на этот:
bot.on('web_app_data', async (ctx) => {
    try {
        const rawData = ctx.webAppData.data.text();
        const data = JSON.parse(rawData);
        const totalAmount = Math.round(data.totalPrice);

        // 1. Отправляем отчет
        let report = `📦 **Новый заказ!**\n`;
        report += `👤 **Клиент:** ${data.customerName || 'Не указано'}\n`;
        report += `📍 **Адрес:** ${data.customerAddress || 'Не указано'}\n\n`;
        
        const names = { 'sofa': 'Стильный диван', 'chair': 'Мягкое кресло', 'table': 'Обеденный стол' };
        for (const [id, count] of Object.entries(data.products)) {
            if (count > 0) report += `▫️ **${names[id] || id}**: ${count} шт.\n`;
        }
        report += `\n💰 **Итого к оплате:** ${totalAmount} сум.`;

        await ctx.reply(report, { parse_mode: 'Markdown' });

        // 2. Попытка выставить счет
        console.log("Пытаюсь отправить счет с токеном:", PAYMENT_TOKEN.substring(0, 10) + "...");
        
        await ctx.replyWithInvoice(
            'Оплата мебели', 
            'Заказ в магазине Mebel Shop',
            `inv_${Date.now()}`, // Всегда уникальный ID
            PAYMENT_TOKEN,
            'UZS', 
            [{ label: 'Товары', amount: totalAmount * 100 }]
        );

    } catch (e) {
        // Это поможет увидеть точную ошибку в View Logs на Railway
        console.error("ПОЛНАЯ ОШИБКА:", e.description || e.message);
        ctx.reply(`❌ Ошибка: ${e.description || 'Не удалось создать счет'}`);
    }
});

// ОБЯЗАТЕЛЬНО: Подтверждение готовности к оплате
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// Сообщение после успешной оплаты
bot.on('successful_payment', async (ctx) => {
    await ctx.reply('✅ Оплата прошла успешно! Мы начали сборку вашего заказа. Доставка по Ташкенту в течение дня.');
});

bot.launch();
// Попытка выставить счет
console.log("Отправка счета...");

await ctx.replyWithInvoice(
    'Заказ в Mebel Shop',          // 1. Title (ОБЯЗАТЕЛЬНО)
    'Оплата мебели и аксессуаров',  // 2. Description (ОБЯЗАТЕЛЬНО)
    `inv_${Date.now()}`,           // 3. Payload
    PAYMENT_TOKEN,                 // 4. Provider Token
    'UZS',                         // 5. Currency
    [{ label: 'К оплате', amount: totalAmount * 100 }] // 6. Prices
).catch(err => {
    console.error("Детальная ошибка Telegram API:", err);
    throw err;
});