import { Client, DiscussMessageEvent, GroupMessageEvent, MessageElem, PrivateMessageEvent, segment, TextElem } from "oicq"
import helps from "./helps"
import Data from "./data"
import { user } from "./data"
import lib from "./lib"
import axios from "axios"
import * as fsp from "fs/promises"
import { Db, ObjectId } from "mongodb"
import pinyin from 'pinyin'
import config_ from './config'
import { Questions } from './questions'

let data = new Data()
let client: Client = null
let ban = null
let questions = null
export async function init(c: Client, b: Function) {
    await data.connect(config_.database)
    questions = new Questions(data.db)
    client = c
    ban = b
}

async function help(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    const { ...helps_ } = helps.helps
    if (e.message_type !== 'group' || !config_.whitelist[e.group_id]) {
        delete helps_['pixiv']
        delete helps_['image']
    }
    if (args.length) {
        const target = (args[0] as TextElem).text
        if (helps_[target]) e.reply('.' + target + ':\n' + helps_[target].detail)
        else e.reply('未找到此命令，请使用 .help 命令查看帮助', true)
    } else {
        let res = helps.index
        const cmds = Object.keys(helps_)
        for (let i = 0; i < cmds.length; i++) {
            res += (i ? '\n' : '') + (i + 1).toString() + ' .' + cmds[i] + ': ' + helps_[cmds[i]].description
        }
        e.reply(res)
    }
}

async function sign(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    const name = e.sender['card'] || e.sender.nickname
    const point = parseInt(lib.random(50, 15).toFixed())
    const now = new Date()
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    if (user.last.getTime() < 1645277584941) user.last = new Date(2004, 7, 17)
    if (!lib.test(user.last)) {
        return e.reply('重复签到，上次签到时间：\n' + lib.format(user.last), true)
    }
    const raw = user.agTimes
    user.agTimes += 50
    if (user.agTimes > 100) user.agTimes = 100
    user.signPoint += point
    user.total += point
    user.sign++
    user.last = now
    user.save()
    await e.reply(name + ' 签到成功，获得 ' + point + ' 点，' + (user.agTimes - raw) + ' 体力\n' + lib.format(now), true)
}

async function info(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    let to: number, name: string
    if (!args.length) {
        to = e.sender.user_id
        name = e.sender.nickname
    } else {
        try {
            [to, name] = lib.getInfo(args[0])
        } catch (err) {
            return e.reply(err.toString() + '，请使用命令 ".help info" 查看帮助。', true)
        }
    }
    const user = await data.user(to, null, false)
    if (!user.name) {
        user.name = name ? name : to.toString()
    }
    let text = user.name + '\n'
    text += '签到获得: ' + user.signPoint.toString() + ' 点\n    签到 ' + user.sign.toString() + ' 次，平均 ' + (user.sign ? user.signPoint / user.sign : 0).toFixed(2).toString() + ' 点/次\n'
    text += '交易获得: ' + user.exchange.toString() + ' 点\n    发送 ' + user.send.toString() + ' 次，接收 ' + user.receive + ' 次\n'
    text += '抽奖净得: ' + user.lotPoint.toString() + ' 点, 抽奖 ' + user.lot + ' 次\n'
    text += '红包获得: ' + user.luyPoint.toString() + ' 点, 抢红包 ' + user.luy + ' 次\n'
    text += '猜词 ' + user.guess + ' 次，赢 ' + user.guessSuccess + ' 次\n'
    // text += '抢劫获得: ' + user.robPoint.toString() + ' 点\n    抢劫 ' + user.rob + ' 次, 被抢 ' + user.robed +' 次\n'
    text += '总计: ' + user.total.toString() + ' 点, 体力 ' + user.agTimes.toString()
    e.reply(text, true)
}

async function rank(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    let here = true, page = 1, all: user[] = [], text = '', count: number
    for (const i of args) {
        if (i.type === 'text') {
            if (i.text === 'all') here = false
            if (/^\d+$/.test(i.text)) page = parseInt(i.text)
        }
    }
    if (!here) {
        text = '[总排行榜]\n'
        all = (await data.db.collection('cntbot').find().sort({ total: -1 }).skip((page - 1) * 10).limit(10).toArray()) as unknown as user[]
        count = await data.db.collection('cntbot').find().count()
    } else if (e.hasOwnProperty('group_id')) {
        text = '[本群排行榜]\n'
        const groups = await client.getGroupMemberList((e as GroupMessageEvent).group_id)
        for (const [k, e] of groups) {
            if (data.test(k)) {
                const user = await data.user(k)
                user.name = e.card || e.nickname
                all.push(user)
            }
        }
        all.sort((a, b) => b.total - a.total)
        count = all.length
        all = all.slice((page - 1) * 10, (page - 1) * 10 + 10)
    }
    if (all.length) {
        for (let i = 0; i < all.length; i++) {
            if (all[i].settings.public === 'true') text += ((page - 1) * 10 + 1 + i).toString() + '. ' + all[i].name + '(' + all[i].id + ') - ' + all[i].total + ' 点\n'
            else text += ((page - 1) * 10 + 1 + i).toString() + '. ' + all[i].name + ' - ' + all[i].total + ' 点\n'
        }
        text += '[第 ' + page + ' 页，共 ' + Math.ceil(count / 10) + ' 页]'
    } else text += '暂无数据\n[第 ' + page + ' 页，共 ' + Math.ceil(count / 10) + ' 页]'
    e.reply(text)
}

async function config(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    const keys = ['public']
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    if (args.length == 1) {
        const name = (args[0] as TextElem).text
        if (keys.indexOf(name) !== -1) {
            if (user.settings.hasOwnProperty(name)) {
                e.reply(name + ' = ' + user.settings[name], true)
            } else e.reply('暂无数据', true)
        } else e.reply('此设置项不合法', true)
    } else if (args.length > 1) {
        const name = (args[0] as TextElem).text
        if (keys.indexOf(name) !== -1) {
            user.settings[name] = (args[1] as TextElem).text
            user.save()
            e.reply(name + ' = ' + user.settings[name], true)
        } else e.reply('此设置项不合法', true)
    } else {
        let text = ''
        const items = Object.entries(user.settings)
        for (let i = 0; i < items.length; i++) {
            text = (i ? '\n' : '') + items[i][0] + ' = ' + items[i][1].toString()
        }
        if (text.length) e.reply(text, true)
        else e.reply('暂无数据', true)
    }
}

async function send(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    if (args.length !== 2) return e.reply('参数数量错误， 请使用命令 ".help send" 查看帮助。', true)
    let to: number
    try {
        [to,] = lib.getInfo(args[0])
    } catch (err) {
        return e.reply(err.toString() + ', 请使用命令 ".help send" 查看帮助。', true)
    }
    const ptss = (args[1] as TextElem).text
    if (!/^\d+$/.test(ptss.trim())) return e.reply('点数格式错误， 请使用命令 ".help send" 查看帮助。', true)
    const pts = parseInt(ptss.trim())
    const from_u = await data.user(e.sender.user_id, e.sender.nickname, false)
    const toinfo = await client.getGroupMemberInfo(e.group_id, to)
    if (pts > from_u.total) return e.reply('点数数量不足', true)
    from_u.total -= pts
    from_u.exchange -= pts
    from_u.send++
    from_u.save()
    const to_u = await data.user(to, toinfo.nickname, false)
    to_u.total += pts
    to_u.exchange += pts
    to_u.receive++
    to_u.save()
    e.reply('发送成功:\n' + (e.sender['card'] || e.sender.nickname) + '->' + (toinfo.card || toinfo.nickname) + '\n' + pts.toString() + ' 点', true)
}

async function image(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (e.message_type === 'group' && !config_.whitelist[e.group_id]) return
    let name
    try {
        const user = await data.user(e.sender.user_id, e.sender.nickname, false)
        if (user.total < 5) return e.reply('点数不足', true)
        const tip = await e.reply('请稍等...')
        let tags = []
        for (let i of args) {
            if (i.type === 'text') tags.push('tag=' + encodeURI(i.text))

        }
        const res = await axios.get('https://api.lolicon.app/setu/v2?r18=0&' + tags.join('&') + '&proxy=' + config_.proxy)
        const info = res.data.data[0]
        if (!info) {
            await client.deleteMsg(tip.message_id)
            return e.reply("未找到此标签", true)
        }
        const res2 = await axios.get(info.urls.original)
        if (res2.data.code) return e.reply("错误: " + res2.data.code.toString(), true)
        const url = res2.data.imageUrl
        name = info.pid.toString() + '.' + info.ext
        await lib.downloadFile(url, name)
        user.total -= 5
        user.save()
        await e.reply(["标题: " + info.title + '\n作者: ' + info.author + "\nPID: " + info.pid.toString() + '\n' + (e.sender['card'] || e.sender.nickname) + ' 消耗 5 点', segment.image(name)])
        await client.deleteMsg(tip.message_id)
    } catch (err) {
        e.reply(err.toString(), true)
    } finally {
        try {
            await fsp.unlink(name)
        } catch (err) {
            console.log("文件删除出错: ", err)
        }
    }
}
async function pixiv(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (e.message_type === 'group' && !config_.whitelist[e.group_id]) return
    if (args.length <= 0) return e.reply('搜索内容为空', true)
    let name, downloaded = false
    let isSponsers = config_.sponsors[e.sender.user_id]
    try {
        const user = await data.user(e.sender.user_id, e.sender.nickname, false)
        if (!isSponsers && user.total < 3) return e.reply('点数不足', true)
        const tip = await e.reply('请稍等...')
        const searchs = [], argv = {}, isarg = {}
        for (let i = 0; i < args.length; i++) {
            if (args[i].type === 'text') {
                const tt = (args[i] as TextElem).text
                if (tt.startsWith('-')) {
                    const name = tt.replace(/^-+/, '')
                    if (i >= args.length - 1 || (args[i + 1].type === 'text' && (args[i + 1] as TextElem).text).startsWith('-')) {
                        argv[name] = true
                    } else {
                        isarg[i + 1] = true
                        argv[name] = args[i + 1]
                    }
                } else if (!isarg[i]) {
                    searchs.push(tt)
                }
            }
        }
        if (argv['user'] && argv['user'].type === 'text') {
            const res = await axios.get(config_.pixiv_api + '/user?user=' + encodeURI(argv['user'].text) + (argv['h'] ? '&h=' + lib.get(argv, 'h', { text: '0' }).text : ''))
            const info = res.data
            if (info.code) {
                await client.deleteMsg(tip.message_id)
                return e.reply(argv['user'].text + '：' + info.msg, true)
            }
            if (info.data.safe) {
                const url = info.data.url
                name = info.data.pid.toString() + '.' + info.data.ext
                await lib.downloadFile(url, name)
                downloaded = true
                if (!isSponsers) {
                    user.total -= 3
                    user.save()
                }
            }
            await e.reply([info.data.title + '(' + (info.data.safe ? '' : '已屏蔽<R-18>，') + info.data.pid.toString() + ')\n作者: ' + info.data.username + '(' + info.data.uid.toString() + ")\n"
                + `第 ${info.data.pos}/${info.data.total} 张\n` + (e.sender['card'] || e.sender.nickname) + (isSponsers || !info.data.safe ? " 消耗 0 点" : ' 消耗 3 点'), info.data.safe ? segment.image(name) : ''])
            await client.deleteMsg(tip.message_id)
        } else if (argv['uid'] && argv['uid'].type === 'text' && /^\d+$/.test(argv['uid'].text)) {
            const res = await axios.get(config_.pixiv_api + '/uid?uid=' + argv['uid'].text + (argv['h'] ? '&h=' + lib.get(argv, 'h', { text: '0' }).text : ''))
            const info = res.data
            if (info.code) {
                await client.deleteMsg(tip.message_id)
                return e.reply(argv['uid'].text + '：' + info.msg, true)
            }
            if (info.data.safe) {
                const url = info.data.url
                name = info.data.pid.toString() + '.' + info.data.ext
                await lib.downloadFile(url, name)
                downloaded = true
                if (!isSponsers) {
                    user.total -= 3
                    user.save()
                }
            }
            await e.reply([info.data.title + '(' + (info.data.safe ? '' : '已屏蔽<R-18>，') + info.data.pid.toString() + ')\n作者: ' + info.data.username + '(' + info.data.uid.toString() + ")\n"
                + `第 ${info.data.pos}/${info.data.total} 张\n` + (e.sender['card'] || e.sender.nickname) + (isSponsers || !info.data.safe ? " 消耗 0 点" : ' 消耗 3 点'), info.data.safe ? segment.image(name) : ''])
            await client.deleteMsg(tip.message_id)
        } else if (argv['pid'] && argv['pid'].type === 'text' && /^\d+$/.test(argv['pid'].text)) {
            const res = await axios.get(config_.pixiv_api + '/image?pid=' + argv['pid'].text)
            const info = res.data
            if (info.code) {
                await client.deleteMsg(tip.message_id)
                return e.reply(argv['pid'].text + '：' + info.msg, true)
            }
            if (info.data.safe) {
                const url = info.data.url
                name = info.data.pid.toString() + '.' + info.data.ext
                await lib.downloadFile(url, name)
                downloaded = true
                if (!isSponsers) {
                    user.total -= 3
                    user.save()
                }
            }
            await e.reply([info.data.title + '(' + (info.data.safe ? '' : '已屏蔽<R-18>，') + info.data.pid.toString() + ')\n作者: ' + info.data.username + '(' + info.data.uid.toString() + ")\n"
                + (e.sender['card'] || e.sender.nickname) + (isSponsers || !info.data.safe ? " 消耗 0 点" : ' 消耗 3 点'), info.data.safe ? segment.image(name) : ''])
            await client.deleteMsg(tip.message_id)
        } else {
            const search = searchs.join(' ')
            if (search.length <= 0) return e.reply('搜索内容为空', true)
            const res = await axios.get(config_.pixiv_api + '/search?search=' + encodeURI(search) + '&p=' + lib.get(argv, 'p', { text: '1' }).text + (argv['h'] ? '&h=' + lib.get(argv, 'h', { text: '0' }).text : ''))
            const info = res.data
            if (info.code) {
                await client.deleteMsg(tip.message_id)
                return e.reply(search + '：' + info.msg, true)
            }
            const url = info.data.url
            name = info.data.pid.toString() + '.' + info.data.ext
            await lib.downloadFile(url, name)
            downloaded = true
            if (!isSponsers) {
                user.total -= 3
                user.save()
            }
            const tpage = Math.ceil(info.data.total / 60)
            await e.reply([info.data.title + '(' + info.data.pid.toString() + ')\n作者: ' + info.data.username + '(' + info.data.uid.toString() + ")\n"
                + `第 ${info.data.page}/${tpage} 页, 此页第 ${info.data.pos}/${info.data.page == tpage ? info.data.total % 60 : 60} 张\n总第 ${(info.data.page - 1) * 60 + info.data.pos}/${info.data.total} 张\n`
                + (e.sender['card'] || e.sender.nickname) + (isSponsers ? " 消耗 0 点" : ' 消耗 3 点'), segment.image(name)])
            await client.deleteMsg(tip.message_id)
        }
    } catch (err) {
        console.log(err)
        e.reply(err.toString(), true)
    } finally {
        if (downloaded) {
            try {
                await fsp.unlink(name)
            } catch (err) {
                console.log("文件删除出错: ", err)
            }
        }
    }
}
async function run(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    const languages = {
        'py': "python",
        'c++': "cpp",
        "c": "c",
        'js': "javascript",
        "ts": "typescript",
        'bash': "bash",
        "c#": "c#",
        "java": "java",
        "kotlin": "kotlin",
        "php": "php",
        "rust": "rust",
        "go": "go"
    }
    if (args.length) {
        const language = (args[0] as TextElem).text
        if (languages[language]) {
            const tmp1 = e.raw_message.split(/[\n\r]/)
            const code = tmp1.slice(1, tmp1.length).join('\n')
            try {
                const res = await lib.run_code(languages[language], code, config_.token)
                const text = 'STDOUT:\n' + res.stdout + '\nSTDERR:' + res.stderr
                e.reply(text)
            } catch (err) {
                return e.reply(err.toString(), true)
            }
        } else e.reply("不支持此语言: " + language, true)
    } else {
        let text = '目前支持的语言: \n'
        const ls = Object.keys(languages)
        for (let i = 0; i < ls.length; i++) {
            text += (i ? '\n' : '') + (i + 1).toString() + '. ' + ls[i] + ': ' + languages[ls[i]]
        }
        e.reply(text)
    }
}

async function lot(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    const pts = [1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 5, 11, 15, 15, 15, 20, 70]
    const raw = user.total
    if (args.length && /^\d+$/.test((args[0] as TextElem).text)) {
        const loop = parseInt((args[0] as TextElem).text)
        if (loop <= 0) return e.reply("抽取次数超出范围", true)
        const res = []
        let cnt = 0, sum = 0
        let res_count = {}
        for (const i of pts) res_count[i] = 0
        for (let i = 1; i <= loop; i++) {
            if (user.total < 10) {
                break
            }
            const num = pts[Math.floor(Math.random() * pts.length)]
            res_count[num]++
            sum += num
            user.total -= 10
            user.total += num
            user.lot++
            user.lotPoint += num - 10
            cnt++
        }
        user.save()
        let res_text = ''
        for (const i in res_count) {
            if (res_count[i]) res_text += i + '(' + res_count[i] + ') '
        }
        res_text = res_text.substring(0, res_text.length - 1)
        e.reply(raw.toString() + ' + ' + sum.toString() + " - " + cnt * 10 + ' = ' + user.total.toString() + '\n' + res_text, true)
    } else {
        if (user.total < 10) return e.reply("点数不足", true)
        const num = pts[Math.floor(Math.random() * pts.length)]
        user.total -= 10
        user.total += num
        user.lot++
        user.lotPoint += num - 10
        user.save()
        e.reply(raw.toString() + ' + ' + num.toString() + " - 10 = " + user.total.toString(), true)
    }
}

const luckys: Map<number, any> = new Map()
const lock = {}

async function give(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    if (args.length !== 2) return e.reply("参数数量错误", true)
    let ptss = (args[0] as TextElem).text, cnts = (args[1] as TextElem).text
    if (!/^\d+$/.test(ptss) || !/^\d+$/.test(cnts)) return e.reply("格式错误", true)
    const pts = parseInt(ptss), cnt = parseInt(cnts)
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    if (pts > user.total) return e.reply("点数不足", true)
    if (pts < cnt) return e.reply('总点数小于红包个数', true)
    if (cnt > 30) return e.reply('红包个数不能大于 30', true)
    if (lock[e.group_id]) return e.reply('操作过于频繁，请稍后再试', true)
    lock[e.group_id] = true
    let here = luckys.get(e.group_id)
    if (!here) here = {
        next: 0,
        luckys: new Map()
    }
    const id = here.next
    here.next++
    const lucky = {
        create: new Date(),
        user_id: e.sender.user_id,
        id,
        pts,
        cnt,
        rpts: pts,
        rcnt: cnt,
        name: e.sender['card'] || e.sender.nickname,
        users: new Map()
    }
    here.luckys.set(id, lucky)
    luckys.set(e.group_id, here)
    lock[e.group_id] = false
    user.total -= pts
    user.save()
    e.reply(lucky.name + " 发送了一个红包(" + id.toString() + ')\n共 ' + pts + '点，' + cnt + '个，使用 .get 命令获取')
}

async function get(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    let here = luckys.get(e.group_id)
    if (!here) return e.reply('没有可以获得的红包', true)
    if (lock[e.group_id]) return e.reply('操作过于频繁，请稍后再试', true)
    lock[e.group_id] = true
    let res = [], sum = 0, end = []
    for (let [k, m] of here.luckys) {
        const target = m.users.get(e.sender.user_id)
        if (!target && m.cnt > 0) {
            const pts = m.cnt === 1 ? m.pts : Math.floor(Math.random() * 2147483647) % (Math.ceil(2 * (m.pts - m.cnt) / m.cnt) + 1) + 1
            m.users.set(e.sender.user_id, {
                name: e.sender['card'] || e.sender.nickname,
                pts
            })
            m.pts -= pts
            m.cnt--
            sum += pts
            const result = {
                name: m.name,
                id: m.id,
                pts: pts,
                rpts: m.pts,
                rcnt: m.cnt,
                users: m.users,
                time: m.create
            }
            res.push(result)
            if (!m.cnt) end.push(result)
            here.luckys.set(k, m)
        }
    }
    luckys.set(e.group_id, here)
    lock[e.group_id] = false
    if (!res.length) return e.reply('没有可以获得的红包', true)
    let text = '您获得的红包: \n'
    for (let i = 0; i < res.length; i++) {
        text += (i ? '\n' : '') + (i + 1).toString() + '. ' + res[i].name + ' 的红包, ' + res[i].pts.toString() + ' 点\n   ID=' + res[i].id.toString() + ', 剩余 ' + res[i].rpts.toString() + ' 点, ' + res[i].rcnt.toString() + '个'
    }
    text += '\n共 ' + sum.toString() + ' 点'
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    user.total += sum
    user.luy += res.length
    user.luyPoint += sum
    user.save()
    await e.reply(text, true)
    if (end.length) {
        let etext = '抢完的红包:\n'
        for (let i = 0; i < end.length; i++) {
            let name = '<未知>', maxv = -1
            for (let [k, v] of end[i].users) {
                if (maxv < v.pts) {
                    name = v.name, maxv = v.pts
                }
            }
            etext += (i ? '\n' : '') + (i + 1).toString() + '. ' + end[i].name + ' 的红包\n   ID=' + end[i].id.toString() + ', 耗时 ' + lib.getOffset(end[i].time) + ', ' + name + ' 是运气王'
        }
        e.reply(etext)
    }
}

async function lucky(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    if (args.length === 0) {
        let here = luckys.get(e.group_id), text = '', cnt = 1
        if (!here || !here.luckys.size) return e.reply('没有未抢完的红包', true)
        for (let [k, m] of here.luckys) {
            if (m.cnt) {
                text += (cnt > 1 ? '\n' : '') + cnt.toString() + '. ' + m.name + ' 的红包\n   ID=' + m.id.toString() + ', 剩余 ' + m.pts.toString() + ' 点, ' + m.cnt.toString() + '个'
                cnt++
            }
        }
        if (text.length) e.reply('当前未抢完的红包:\n' + text, true)
        else e.reply('没有未抢完的红包', true)
    } else {
        const here = luckys.get(e.group_id)
        const id = (args[0] as TextElem).text
        if (!/^\d+$/.test(id)) return e.reply('ID 格式错误', true)
        const lucky = here.luckys.get(parseInt(id))
        if (!lucky) return e.reply('找不到此红包', true)
        let text = '', cnt = 1
        text = lucky.name + ' 于 ' + lib.format(lucky.create) + ' 发的红包:\n'
        text += 'ID=' + lucky.id.toString() + ', 共 ' + lucky.rpts + ' 点, ' + lucky.rcnt + '个\n'
        if (lucky.users.size) {
            text += '抢红包记录: \n'
            for (let [k, v] of lucky.users) {
                text += (cnt > 1 ? '\n' : '') + cnt.toString() + '. ' + v.name + '，' + v.pts.toString() + ' 点'
                cnt++
            }
        } else text += '没有人抢过这个红包'
        e.reply(text, true)
    }
}

async function rob(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    if (args.length !== 2) return e.reply("参数数量错误", true)
    const num_text = (args[1] as TextElem).text
    if (!/^\d+$/.test(num_text)) return e.reply('抢劫数量格式错误', true)
    let num = parseInt(num_text)
    let target_id = 0, name = null
    try {
        [target_id, name] = lib.getInfo(args[0])
    } catch (err) {
        return e.reply(err.toString(), true)
    }
    const target = await data.user(target_id, null, false)
    if (e.sender.user_id === target_id) return e.reply("无法抢劫自己", true)
    if (target.total <= 0) return e.reply("对方点数小于等于 0, 无法抢劫", true)
    if (!name) name = target.name ? target.name : target_id.toString()
    const self = await data.user(e.sender.user_id, e.sender.nickname, false)
    if (self.total <= 0) return e.reply("您的点数不足", true)
    let min = self, max = target
    if (min.total > max.total) [min, max] = [max, min]
    let total = min.total + max.total
    const random = Math.random()
    const isSucceed = random <= (min.total / total)
    let text = '判定: ' + (isSucceed ? '成功' : '失败') + '\n随机结果(' + random.toFixed(4) + ')-成功概率(' + (min.total / total).toFixed(4) + ')'
    if (target.total < num) num = target.total
    if (isSucceed) {
        self.total += num
        self.rob++
        self.robPoint += num
        target.total -= num
        target.robed++
        target.save()
        self.save()
        text += '\n'
        const message: any = [text]
        message.push(segment.at(target_id))
        text = ' 被抢劫了 ' + num + ' 点'
        text += '\n' + (e.sender['card'] || e.sender.nickname) + ' 获得了 ' + num + ' 点'
        message.push(text)
        client.sendGroupMsg(e.group_id, message)
    } else {
        if (self.total < num) num = self.total
        self.total -= num
        // self.rob++
        self.robPoint -= num
        self.save()
        target.total += num
        // target.robed++
        target.save()
        text += '\n'
        const message: any = [text]
        text = (e.sender['card'] || e.sender.nickname) + ' 被罚款 ' + num + ' 点'
        text += '\n' + target.name + ' 获得 ' + num + ' 点'
        message.push(text)
        client.sendGroupMsg(e.group_id, message)
    }
}

let idi_log = new Map()
let idi_user_log = new Map()

async function idi(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    if (args.length !== 1) return e.reply('参数数量错误', true)
    if (args[0].type !== 'text' || !/[\u4e00-\u9fa5]{4}/.test(args[0].text)) return e.reply('参数格式错误，请检查是否为 4 字词语')
    let res
    try {
        res = await axios.get(config_.idi_api + '/get?word=' + encodeURI(args[0].text))
    } catch (err) {
        return e.reply(err.toString(), true)
    }
    const data_ = res.data
    const dataBuffer = Buffer.from(data_.pic, 'base64');
    const path = `${e.group_id}_${e.sender.user_id}_${Math.random()}.png`
    await fsp.writeFile(path, dataBuffer)
    await e.reply(segment.image(path))
    console.log('猜:', args[0].text, '答案:', data_.word, data_.success)
    fsp.unlink(path)
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    user.guess++
    if (idi_user_log.get(e.sender.user_id) !== data_.word) {
        user.total -= 1
        await e.reply((e.sender['card'] || e.sender.nickname) + ' 加入此轮游戏，扣除 1 点。', true)
    }
    if (data_.success) {
        await e.reply('答案正确：' + args[0].text + '，赢得 15 点。\n' + args[0].text + '：' + data_.explanation, true)
        user.total += 15
        user.guessSuccess++
        for (let [gid, wd] of idi_log) {
            if (wd === args[0].text) {
                try {
                    await client.sendGroupMsg(gid, '[猜成语]上一轮游戏中， ' + e.sender.nickname + ' 答对了，正确答案：' + args[0].text + '。游戏进入下一轮。')
                } catch { }
            }
        }
    }
    idi_log.set(e.group_id, data_.word)
    idi_user_log.set(e.sender.user_id, data_.word)
    user.save()
}

const rd_data = new Map()
const rd_lock = new Map()

async function rd(args: MessageElem[], e: PrivateMessageEvent | GroupMessageEvent, client: Client) {
    if (args.length <= 0) return e.reply('参数数量错误', true)
    const subcommand = (args[0] as TextElem).text
    if (subcommand === 'add') {
        // .rd add [群号] [悬赏点数]
        if (e.message_type !== 'private') return e.reply('请在私聊中使用', true)
        args.shift()
        if (args.length < 3) return e.reply('参数数量错误[1]', true)
        if (!/^\d+$/.test((args[0] as TextElem).text)) return e.reply('群号格式错误，请检查是否为数字', true)
        if (!/^\d+$/.test((args[1] as TextElem).text)) return e.reply('点数格式错误，请检查是否为数字', true)
        const splitlines = e.raw_message.split(/[\r\n]+/)
        console.log(splitlines)
        if (splitlines.length < 3) return e.reply('参数数量错误[2]', true)
        const [question, answer] = [splitlines[1], splitlines.slice(2)]
        const [group_id, pts] = [parseInt((args[0] as TextElem).text), parseInt((args[1] as TextElem).text)]
        if (rd_lock.get(group_id)) return e.reply('请稍后再试', true)
        rd_lock.set(group_id, true)
        let this_group = rd_data.get(group_id)
        if (!this_group) this_group = {
            next: 1,
            questions: new Map()
        }
        const author = await data.user(e.sender.user_id, e.sender.nickname, false)
        if (author.total < pts) {
            rd_lock.set(group_id, false)
            return e.reply('点数不足', true)
        }
        author.total -= pts
        author.save()
        console.log(question, pts, e.sender.user_id, answer)
        const id = this_group.next
        this_group.questions.set(id, {
            question: question.trim(),
            answer: answer.map(e => e.trim()),
            pts,
            author: e.sender.user_id,
            created: new Date()
        })
        this_group.next++
        rd_data.set(group_id, this_group)
        rd_lock.set(group_id, false)
        await client.sendGroupMsg(group_id, '新的谜语：\n' + id + '. ' + question + '(' + pts + '点)\n请使用 ".rd ' + id + ' [谜底]" 来回答')
        return e.reply('添加成功，已扣除 ' + pts + '点。', true)
    } else if (subcommand === 'get') {
        // .rd get
        if (e.message_type !== 'group') return e.reply('请在群聊中使用', true)
        const group_id = e.group_id
        const this_group = rd_data.get(group_id)
        if (!this_group || !this_group.questions.size) return e.reply('没有谜语', true)
        const page = parseInt((args[1] as TextElem)?.text) || 1
        const all = Array.from(this_group.questions.entries()).sort((a, b) => b[0] - a[0])
        const questions = all.slice((page - 1) * 10, (page - 1) * 10 + 10)
        let text = ''
        if (questions.length > 0) {
            for (let i = 0; i < questions.length; i++) {
                const [id, q] = questions[i] as unknown as [number, { question: string, answer: string[], pts: number, author: number }]
                text += (i ? '\n' : '') + id + '. ' + q.question + '(' + q.pts + '点)'
            }
        } else text = '无数据'
        return e.reply(text + '\n[第' + page + '页/共' + Math.ceil(this_group.questions.size / 10) + '页]', true)
    } else {
        // .rd [ID] [谜底]
        if (e.message_type !== 'group') return e.reply('请在群聊中使用', true)
        if (args.length < 2) return e.reply('参数数量错误', true)
        const group_id = e.group_id
        const this_group = rd_data.get(group_id)
        if (!this_group || !this_group.questions.size) return e.reply('没有谜语', true)
        if (rd_lock.get(group_id)) return e.reply('请稍后再试', true)
        const id = parseInt((args[0] as TextElem).text)
        const q = this_group.questions.get(id)
        if (!q) return e.reply('谜语不存在', true)
        if (q.author === e.sender.user_id) return e.reply("不能回答自己的谜语", true)
        rd_lock.set(group_id, true)
        const answer = e.raw_message.split(' ').slice(2).join(' ').trim()
        let flag = false
        for (let i of q.answer) {
            if (answer === i) {
                flag = true
                break
            }
        }
        if (flag) {
            const user = await data.user(e.sender.user_id, e.sender.nickname, false)
            user.total += q.pts
            user.save()
            await e.reply(q.question + '\n标准答案：' + q.answer.join('，') + '\n您的答案：' + answer + '\n答案正确，赢得 ' + q.pts + ' 点。', true)
            try {
                client.sendPrivateMsg(q.author, '您在群 ' + group_id + ' 中的谜语(' + q.question + ')被 ' + (e.sender.card || e.sender.nickname) + ' 答对了。')
            } catch { }
            this_group.questions.delete(id)
            rd_data.set(group_id, this_group)
        } else {
            await e.reply(q.question + '\n您的答案：' + answer + '\n答案错误。', true)
        }
        rd_lock.set(group_id, false)
    }
}

async function hito(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    const tags = []
    const types = {
        动画: 'a',
        漫画: 'b',
        游戏: 'c',
        文学: 'd',
        原创: 'e',
        网络: 'f',
        影视: 'h',
        诗词: 'i',
        网易云: 'j',
        哲学: 'k',
        抖机灵: 'l'
    }
    const restype = {
        a: '动画',
        b: '漫画',
        c: '游戏',
        d: '文学',
        e: '原创',
        f: '来自网络',
        g: '其他',
        h: '影视',
        i: '诗词',
        j: '网易云',
        k: '哲学',
        l: '抖机灵'
    }
    for (let i of args) {
        if (i.type === 'text' && types[i.text]) {
            tags.push('c=' + types[i.text])
        }
    }
    let res
    try {
        res = await axios.get("https://v1.hitokoto.cn/?" + tags.join('&'))
    } catch (err) {
        return e.reply(err.toString(), true)
    }
    const data = res.data
    let text = `———————————

${data.hitokoto}

———————————
${data.from} ${data.from_who ? '/ ' + data.from_who + ' ' : ''}/ ${restype[data.type]}`
    e.reply(text)
}

const ag_data = new Map()
const ag_lock = new Map()

async function ag(args: MessageElem[], er: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (er.message_type !== 'group') return er.reply('请在群聊中使用', true)
    const e: GroupMessageEvent = er as GroupMessageEvent
    const group_id = e.group_id
    let state = ag_data.get(group_id)
    async function next() {
        const res = await questions.update()
        if (res.order === 'random') res.tips = lib.random_shuffle(res.tips)
        res.tip_id = 0
        state = res
        state.v = state.cnt ? (state.succeed || 0) / state.cnt : 0.9999
        state.pts = 10 + parseInt(((1 - state.v) * 20).toFixed())
        state.url = encodeURI(state.url)
        state.blur_url = encodeURI(state.blur_url)
        state.cnt = state.cnt || 0
        state.succeed = state.succeed || 0
        state.answers_pinyin = state.answers.map(e => pinyin(e.toLowerCase(), { heteronym: true, style: pinyin.STYLE_NORMAL }))
        return state
    }
    const user = await data.user(e.sender.user_id, e.sender.nickname, false)
    if (user.agTimes <= 0) return e.reply('体力不足，请使用 ".sign" 签到。', true)
    if (!state) {
        if (ag_lock.get(group_id)) return e.reply('请稍后再试', true)
        ag_lock.set(group_id, true)
        state = await next()
        ag_data.set(group_id, state)
        ag_lock.set(group_id, false)
        const _id = state._id.toHexString()
        return e.reply(['新的题目[' + _id.substring(_id.length - 6) + ' by:' + state.nickname  + ']!\n', segment.image(state.mode === 'blur' ? state.blur_url : state.url2), '\n请使用 ".ag [答案]" 回答。'])
    }
    if (args.length > 0) {
        if (args[0].type !== 'text') return e.reply('参数格式错误', true)
        const second = args[0].text.trim()
        const answer = pinyin(second.toLowerCase(), { heteronym: true, style: pinyin.STYLE_NORMAL })
        let flag = false
        for (let i of state.answers_pinyin)
            if (lib.pinyinEqual(i, answer)) {
                flag = true
                break
            }
        if (flag) {
            if (state.user_id === e.sender.user_id) return e.reply('不能回答自己的题目', true)
            if (ag_lock.get(group_id)) return e.reply('请稍后再试', true)
            ag_lock.set(group_id, true)
            const _id = state._id.toHexString()
            const pts = state.pts - (state.tip_id * 4 > state.pts - 5 ? state.pts - 5 : state.tip_id * 4)
            state.cnt++
            state.succeed++
            e.reply([segment.image(state.url), '[' + _id.substring(_id.length - 6) + ' ' + 'by:' + state.nickname + ' from:' + state.from
                + ' qd:' + (1 - state.succeed / state.cnt).toFixed(2) + ']\n[提示]\n' + state.tips.join('\n') + '\n[答案]\n' + state.answers.join(', ') + '\n[答案正确，'
                + (e.sender.card || e.sender.nickname) + ' 赢得 ' + pts + ' 点，使用 ".ag" 查看下一题。 ]'], true)
            await questions.inc(state._id, 1)
            user.total += pts
            user.agTimes--
            user.save()
            ag_data.set(group_id, null)
            ag_lock.set(group_id, false)
        } else if (second === 'next' && state.tip_id + 1 >= state.tips.length) {
            if (ag_lock.get(group_id)) return e.reply('请稍后再试', true)
            ag_lock.set(group_id, true)
            e.reply('[已跳过，使用 ".ag" 查看下一题。 ]', true)
            ag_data.set(group_id, null)
            ag_lock.set(group_id, false)
            await questions.inc(state._id, 0)
        } else if (second === 'img') {
            e.reply(segment.image(state.blur_url))
        } else {
            if (state.user_id === e.sender.user_id) return e.reply('不能回答自己的题目', true)
            e.reply(second + ': 答案错误。', true)
        }
    } else {
        if (state.tip_id >= state.tips.length) {
            const _id = state._id.toHexString()
            return e.reply('[' + _id.substring(_id.length - 6) + ' by:' + state.nickname + ' qd:' + (state.cnt ? (1 - state.succeed / state.cnt).toFixed(2) : '空') + ']\n' + state.tips.join('\n') + '\n[".ag next" 跳过]', true)
        }
        if (ag_lock.get(group_id)) return e.reply('请稍后再试', true)
        ag_lock.set(group_id, true)
        const tip = state.tips[state.tip_id]
        await e.reply('提示 ' + (state.tip_id + 1) + ': ' + tip, true)
        state.tip_id++
        ag_data.set(group_id, state)
        ag_lock.set(group_id, false)
    }
}

async function tran(args: MessageElem[], e: GroupMessageEvent | PrivateMessageEvent | DiscussMessageEvent, client: Client) {
    if (args.length < 1 && !e?.source?.message) return e.reply('未找到缩写', true)
    if (args.length >= 3 && args[0].type === 'text' && args[0].text === 'put' && args[1].type === 'text') {
        const short = args[1].text
        if (!/[a-zA-Z0-9]+/.test(short)) return e.reply('缩写格式错误', true)
        let text = args.splice(2).map(i => (i as TextElem).text || '').join(' ')
        axios({
            url: 'https://lab.magiconch.com/api/nbnhhsh/translation/' + short,
            method: 'POST',
            data: { text }
        }).then(res => {
            if (res.status === 200) return e.reply('提交成功，审核通过后显示。', true)
            else return e.reply('提交失败。', true)
        }).catch(err => {
            return e.reply('提交失败：' + err.toSring(), true)
        })
        return
    }
    if (e?.source?.message) args.push({
        type: 'text',
        text: e.source.message
    } as TextElem)
    let texts = []
    for (let i of args) {
        if (i.type === 'text') {
            texts = texts.concat(Array.from(i.text.matchAll(/[a-zA-Z0-9]+/g)).map(i => i[0]))
        }
    }
    if (!texts.length && !e?.source?.message) return e.reply('未找到缩写', true)
    axios({
        url: "https://lab.magiconch.com/api/nbnhhsh/guess",
        method: "POST",
        data: {
            text: texts.join(',')
        }
    }).then(res => {
        let ret = ''
        for (let i of res.data) {
            ret += `[${i.name}] ${(i.trans || i.inputting || []).join(', ') || '未找到'}\n`
        }
        e.reply(ret.substring(0, ret.length - 1), true)
    }).catch(err => {
        e.reply(err.toString(), true)
    })
}

const interval = 60 * 60 * 1000
setInterval(async () => {
    const now = (new Date()).getTime()
    for (let [k, v] of luckys) {
        for (let [e, m] of v.luckys) {
            if (now - m.create.getTime() > interval) {
                if (m.pts) {
                    const user = await data.user(m.user_id, null, false)
                    user.total += m.pts
                    user.save()
                    try {
                        await client.sendTempMsg(k, user.id, "您在群 " + k + ' 所发的红包已过期，剩余点数(' + m.pts + '点)已退回。')
                    } catch {
                        try {
                            await client.sendPrivateMsg(user.id, "您在群 " + k + ' 所发的红包已过期，剩余点数(' + m.pts + '点)已退回。')
                        } catch { }
                    }
                }
                v.luckys.delete(e)
            }
        }
    }
    for (let [k, v] of rd_data) {
        for (let [e, m] of v.questions) {
            if (now - m.created > 24 * 60 * 60 * 1000) {
                const user = await data.user(m.author, null, false)
                user.total += m.pts
                user.save()
                try {
                    await client.sendPrivateMsg(m.author, "您在群 " + k + ' 中的谜语(' + m.question + ')已过期，剩余点数(' + m.pts + '点)已退回。')
                } catch { }
                v.questions.delete(e)
            }
        }
    }
}, interval)

export const commands = {
    help,
    sign,
    info,
    rank,
    config,
    send,
    image,
    run,
    lot,
    give,
    get,
    lucky,
    // rob,
    hito,
    // idi,
    pixiv,
    rd,
    ag,
    tran
}
