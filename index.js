const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session')
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    })

    // Pairing Code Handler
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('\nMasukkan nomor WhatsApp kamu (awali dengan 62, cth: 628xxxxxxxxxx): ')
        let code = await sock.requestPairingCode(phoneNumber.trim())
        code = code?.match(/.{1,4}/g)?.join('-') || code
        console.log(`\n========================================`)
        console.log(`KODE PAIRING KAMU : ${code}`)
        console.log(`========================================\n`)
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Koneksi terputus, menyambungkan ulang...', shouldReconnect)
            if (shouldReconnect) {
                startBot()
            }
        } else if (connection === 'open') {
            console.log('\n[SUKSES] Bot terhubung! Siap Auto-View SW secara real-time.')
        }
    })

    sock.ev.on('creds.update', saveCreds)

    // FITUR UTAMA: Auto-View & Auto-Read Status Baru yang Masuk
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m || !m.message) return
        
        // 1. Deteksi jika pesan masuk adalah Status WhatsApp
        if (m.key.remoteJid === 'status@broadcast') {
            try {
                // Tandai sudah dibaca (view)
                await sock.readMessages([m.key])
                const sender = m.key.participant ? m.key.participant.split('@')[0] : 'Seseorang'
                console.log(`[AUTO-VIEW SW] Berhasil melihat status dari: ${sender}`)

                // Opsional: Kirim reaksi emoji otomatis ke status (misal: ❤️)
                // Hapus komentar (//) di bawah jika ingin bot otomatis react status juga
                /*
                await sock.sendMessage('status@broadcast', {
                    react: { text: '💚', key: m.key }
                }, { statusJidList: [m.key.participant] })
                */

            } catch (error) {
                console.log('Gagal melihat status:', error)
            }
            return
        }

        // 2. Handler Perintah Teks (.readsw)
        const messageType = Object.keys(m.message)[0]
        let body = ''
        if (messageType === 'conversation') {
            body = m.message.conversation
        } else if (messageType === 'extendedTextMessage') {
            body = m.message.extendedTextMessage.text
        }

        if (!body) return
        const chatId = m.key.remoteJid
        const text = body.trim().toLowerCase()

        if (text === '.readsw' || text === '.menu') {
            console.log(`\n[PERINTAH] .readsw dipanggil dari chat: ${chatId.split('@')[0]}`)
            const replyText = `*🤖 WhatsApp Auto SW Bot Active*\n\n` +
                              `Status: Online & Berjalan\n` +
                              `Info: Sistem WhatsApp membatasi akses status lama yang diunggah sebelum bot dinyalakan. Bot ini akan otomatis melihat **setiap status baru** yang masuk secara *real-time*!`
            
            await sock.sendMessage(chatId, { text: replyText }, { quoted: m })
        }
    })
}

startBot()
