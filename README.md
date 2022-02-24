# CNTBOT 机器人 v2

## 通过命令显式触发的功能

### 默认开启的功能

1. help: 显示帮助
2. info: 查询记录
3. sign: 签到
4. rank: 查看点数排行榜
5. config: 设置
6. send: 向他人发送点数
7. image: 发送随机 P 站图片
8. run: 运行代码
9. lot: 抽奖
10. give: 发送一个红包
11. get: 抢红包
12. lucky: 查看红包
13. hito: 发送一条一言
14. pixiv: P 站图片辅助工具
15. rd: 猜谜语
16. ag: 猜动漫
17. tran: 翻译缩写


### 默认关闭（被注释掉）的功能

1. rob: 抢劫他人点数（因为过于 bug 被关闭）
2. idi: 猜成语（因为服务器内存不够被关闭）

## 不通过命令显式触发的功能

1. B站视频解析，检测到 AV/BV 号，B站视频链接或小程序分享，会发送封面和简介

## 配置

数据库使用 mongodb, 请提前配置好数据库。

**src/config.ts**

```typescript
export default {
    account: 123456789, // 机器人 QQ 账号
    database: "mongodb url",
    token: "glot.io api token", // run 功能必须，详见 https://glot.io/api
    proxy: "api.lolicon.app proxy", // image 功能必须，详见 https://api.lolicon.app/#/setu?id=%e8%af%b7%e6%b1%82
    sponsors: {  // 捐助者 QQ 号， pixiv 功能免于消耗点数
        123456789: true
    },
    websocket: "ws://39.105.144.93/ws/bot", // ag 功能后端 ws 地址，代码库：https://github.com/YouXam/cntbot-web
    whitelist: { // image 和 pixiv 功能开放的群号
        123456789: true
    }
}
```

## 使用

```sh
yarn
yarn start
```