import { createClient, segment, TextElem, MessageElem, Sendable, GroupMessageEvent } from "oicq"
import { init, commands } from "./commands"
import lib from "./lib"
import config from './config'
import { client as WebSocketClient } from "websocket"

const client = createClient(config.account)
const list_cache: Map<number, boolean> = new Map()

// const ban_id: Map<number, Date> = new Map()

function ban(user_id: number, duration: number) {
    // const next = new Date((new Date).getTime() + duration * 1000)
    // ban_id.set(user_id, next)
}

client.on("system.online", async () => {
    const wsclient = new WebSocketClient()
    wsclient.connect(config.websocket)
    wsclient.on('connect', socket => {
        console.log('Websocket connected: ' + config.websocket + '.')
        socket.on('message', async message => {
            if (message.type !== 'utf8') return
            const data = JSON.parse(message.utf8Data)
            if (data.type === 'captcha') {
                const info = client.fl.get(data.user_id)
                if (info) {
                    try {
                        await client.sendPrivateMsg(data.user_id, '您正在登录 CNTBOT 管理网站，验证码：' + data.captcha + '，5 分钟内有效。')
                        socket.send(JSON.stringify({
                            type: 'captcha',
                            code: 0,
                            id: data.token,
                            msg: '发送成功。',
                            nickname: info.nickname
                        }))
                    } catch (err) {
                        socket.send(JSON.stringify({
                            type: 'captcha',
                            code: -1,
                            id: data.token,
                            msg: '发送失败，' + err.toString() + '。'
                        }))
                    }
                } else {
                    socket.send(JSON.stringify({
                        type: 'captcha',
                        code: -1,
                        id: data.token,
                        msg: '发送失败，请先添加机器人为好友。'
                    }))
                }
                
            }
        })
        function onclose() {
            console.log('Websocket closed: ' + config.websocket + ', try to connnect again.')
            wsclient.connect(config.websocket)
        }
        socket.on('close', onclose)
        setInterval(() => {
            socket.send(JSON.stringify({ type: 'ping' }))
        }, 5000)
    });
    wsclient.on('connectFailed', error => {
        console.log('Websocket connect failed: ' + error.toString() + ', try again in 5 seconds.');
        setTimeout(() => {
            console.log("Try to connect websocket: " + config.websocket + ".")
            wsclient.connect(config.websocket)
        }, 5000)
    });
    await init(client, ban)
})
client.on("message", async e => {
    let binfo
    try {
        let text = e.raw_message
        if (e.message[0].type === 'json') {
            const data = JSON.parse(e.message[0].data)
            if (data?.meta?.detail_1?.qqdocurl) text = data?.meta?.detail_1?.qqdocurl
        }
        binfo = await lib.getBInfo(text)
        if (binfo.length) {
            for (let i of binfo) await e.reply(i)
        }
    } catch (err) {
        return e.reply(err.toString(), true)
    }
    if (e.message.length >= 2 && e.message[0].type === 'at' && e.message[1].type === 'text' && e?.source?.message) e.message.shift()
    else if (!e.raw_message.startsWith('.')) return
    const msg = e.message
    let args: MessageElem[] = []
    for (const i of msg) {
        if (i.type === "text") {
            const line = i.text.trim().split(/[\s\n\r]+/)
            for (const j of line) {
                if (!j) continue
                args.push({
                    type: "text",
                    text: j
                } as TextElem)
            }
        } else {
            args.push(i)
        }
    }
    if (!args.length || args[0].type !== "text") return
    const cmd = (args[0] as TextElem).text.substring(1, (args[0] as TextElem).text.length)
    if (commands[cmd]) {
        if (e.hasOwnProperty('group_id')) {
            const iscached = list_cache.get((e as GroupMessageEvent).group_id)
            if (!iscached) {
                await client.getGroupMemberList((e as GroupMessageEvent).group_id)
                list_cache.set((e as GroupMessageEvent).group_id, true)
            }
        }
        try {
            // const ban_time = ban_id.get(e.sender.user_id)
            // if (ban_time && (new Date()) <= ban_time) {
            //     let text = '封禁中\n' + lib.formatDuration(ban_time.getTime() - (new Date()).getTime()) + ' 后解禁'
            //     return e.reply(text, true)
            // }
            commands[cmd](args.slice(1, args.length), e, client)
        } catch (e) {
            e.reply(e.toString(), true)
        }
    }
})

client.on("request.friend.add", async e => {
    e.approve()
})


client.on("system.login.qrcode", function (e) {
    process.stdin.once("data", () => {
        this.login()
    })
}).login()