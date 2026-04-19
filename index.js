const { Telegraf } = require('telegraf');

// 1. Вставь токен от @Shop_mebel_bot (получи его у @BotFather)
const bot = new Telegraf('8474220877:AAHmSXn0v-MRbWSZMAWGr16EYoPF1SXD3SQ');

// 2. Ссылка на твой сайт (Mini App)
// Для теста можно использовать GitHub Pages или любой хостинг
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/'; // Твоя ссылка из скрина 5

bot.start((ctx) => {
    ctx.reply('Магазин обновлен! Нажми кнопку:', {
        reply_markup: {
            keyboard: [
                [{ text: "🛒 Открыть каталог", web_app: { url: webAppUrl } }]
            ],
            resize_keyboard: true
        }
    });
});

// Слушаем данные из приложения
bot.on('web_app_data', async (ctx) => {
    try {
        // ИСПРАВЛЕНИЕ: получаем текст через .text()
        const rawData = ctx.webAppData.data.text(); 
        console.log("=== ДАННЫЕ ПОЛУЧЕНЫ ===");
        console.log(rawData);

        const data = JSON.parse(rawData);

        if (!data.products || Object.keys(data.products).length === 0) {
            return ctx.reply("🛒 Ваша корзина пуста.");
        }

        let report = `📦 **Новый заказ!**\n\n`;
        const names = {
            'sofa': 'Стильный диван',
            'chair': 'Мягкое кресло',
            'table': 'Обеденный стол'
        };

        for (const [id, count] of Object.entries(data.products)) {
            if (count > 0) {
                const itemName = names[id] || id;
                report += `▫️ **${itemName}**: ${count} шт.\n`;
            }
        }

        const total = Math.round(data.totalPrice || 0);
        report += `\n💰 **Итого к оплате:** ${total} руб.`;

        await ctx.reply(report, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error("Ошибка парсинга:", e);
        ctx.reply('❌ Ошибка при чтении данных заказа.');
    }
});

bot.launch();
console.log('Бот Shop_mebel запущен!');