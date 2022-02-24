export default {
    account: 123456789, // 机器人 QQ 账号
    database: "mongodb url",
    token: "glot.io api token", // run 功能必须，详见 https://glot.io/api
    proxy: "api.lolicon.app proxy", // image 功能必须，详见 https://api.lolicon.app/#/setu?id=%e8%af%b7%e6%b1%82
    pixiv_api: "pixiv api", // pixiv 功能必须，详见 https://github.com/YouXam/cntbot-services
    idi_api: "idi api", // 猜成语 功能必须，详见 https://github.com/YouXam/cntbot-idi
    sponsors: {  // 捐助者 QQ 号， pixiv 功能免于消耗点数
        123456789: true
    },
    websocket: "ws://39.105.144.93/ws/bot", // ag 功能后端 ws 地址，代码库：https://github.com/YouXam/cntbot-web
    whitelist: { // image 和 pixiv 功能开放的群号
        123456789: true
    }
}