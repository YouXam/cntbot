import { MessageElem, segment, Sendable } from "oicq"
import * as fs from "fs"
import axios from "axios"

function random(m: number, s: number) {
    let u = 0, v = 0, w = 0, c = 0;
    do {
        u = Math.random() * 2 - 1.0;
        v = Math.random() * 2 - 1.0;
        w = u * u + v * v;
    } while (w == 0.0 || w >= 1.0)
    c = Math.sqrt((-2 * Math.log(w)) / w);
    return m + u * c * s
}

function today(time: Date) {
    return new Date(time.getFullYear().toString() + '-' + (time.getMonth() + 1).toString() + '-' + time.getDate().toString())
}

function test(last: string | number | Date) {
    return today(new Date(last)) < today(new Date())
}

function fill(s, n = 2, t = '0') {
    s = s.toString()
    return t.repeat(n - s.length) + s
}

function format(date: Date | string | number) {
    if (typeof (date) !== 'object') {
        date = new Date(date)
    }
    return date.getFullYear() + '-' + fill(date.getMonth() + 1) + '-' + fill(date.getDate()) + ' ' + fill(date.getHours()) + ':' + fill(date.getMinutes()) + ':' + fill(date.getSeconds())
}

function getInfo(e: MessageElem): [number, string] {
    if (e.type === 'at' && e.qq !== 'all') return [e.qq, e.text.substring(1, e.text.length)]
    else if (e.type === 'text' && /^\d+$/.test(e.text)) return [parseInt(e.text), null]
    throw new Error('ID 格式错误')
}

function getSettings(path) {
    try {
        return JSON.parse(fs.readFileSync(path).toString())
    } catch (e) {
        console.log(e.toString())
    }
}

function get(s: Object, t: string, m = null) {
    if (s.hasOwnProperty(t)) return s[t]
    return m
}

async function downloadFile(url, name) {
    const writer = fs.createWriteStream(name);
    const response = await axios({
        url,
        method: "GET",
        responseType: "stream",
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
}

async function run_code(language, code, token) {
    const ext = {
        'python': "main.py",
        'cpp': "main.cpp",
        'javascript': "main.js",
        "c": "main.c",
        "typescript": "main.ts",
        'bash': "main.sh",
        "c#": "main.cs",
        "java": "main.java",
        "kotlin": "main.kt",
        "php": "main.php",
        "rust": "main.rs",
        "go": "main.go"
    }
    const res = await axios({
        method: 'post',
        url: "https://glot.io/api/run/" + language + '/latest',
        data: {
            "files": [
                {
                    "name": ext[language],
                    "content": code
                }
            ]
        },
        headers: {
            'Authorization': 'Token ' + token
        }
    });
    return res.data
}


function formatDuration(ms: number) {
    console.log(ms)
    if (ms < 0) ms = -ms;
    const time = {
        日: Math.floor(ms / 86400000),
        小时: Math.floor(ms / 3600000) % 24,
        分钟: Math.floor(ms / 60000) % 60,
        秒: parseFloat((ms / 1000 % 60).toFixed(2))
    };
    return Object.entries(time)
        .filter(val => val[1] !== 0)
        .map(([key, val]) => `${val} ${key}`)
        .join(' ');
};


function getOffset(time: Date) {
    const offset = (new Date()).getTime() - time.getTime()
    return formatDuration(offset)
}

function short(s: string, n: number) {
    return s.length < n ? s : s.substring(0, n) + '...'
}

function addsep(n: string | number) {
    n = n.toString()
    return n.replace(/\B(?=(\d{4})+(?!\d))/g, ',')
}

async function getBiliShare(aid: string | number) {
    const res = await axios({
        url: 'https://api.bilibili.com/x/share/placard',
        method: 'POST',
        data: 'buvid=-&oid=' + aid.toString() + '&platform=-&share_id=main.ugc-video-detail.0.0.pv'
    })
    return res.data.data
}

async function getBid(url: string) {
    let res
    try {
        res = await axios({
            method: 'get',
            url,
            maxRedirects: 0
        })
    } catch (err) {
        if (err.response.status === 302 && err.response.headers.location) return err.response.headers.location.match(/(?<=\/)BV\w+/)[0]
    }
    return ''
}

async function getBInfo(msg: string) {
    let res = msg.match(/(?<![^ !-.:-@\/[-`{-~：。，、}])((BV|bv)\w{10}|av\d+)/g) || []
    let res2 = msg.match(/https{0,1}:\/\/b23.tv\/\w+/g) || []
    if (res2.length) {
        for (let i of res2) {
            try {
                res.push(await getBid(i))
            } catch (err) {
                console.log(err.toString())
            }
        }
    }
    let text = []
    if (!res.length) return ''
    for (let i = 0; i < res.length; i++) {
        const url = 'http://api.bilibili.com/x/web-interface/view?' + (res[i].toLowerCase().startsWith('bv') ? 'bvid=' + res[i] : '') + (res[i].startsWith('av') ? 'aid=' + res[i].slice(2, res[i].length) : '')
        const response = await axios.get(url)
        if (response.data.code) throw new Error(response.data.message)
        const data = response.data.data
        const share = await getBiliShare(data.aid)
        text = text.concat([segment.image(share.picture),
        `${share.link}\n${data.pages.length > 1 ? '共 ' + data.pages.length + ' P\n' : ''}简介：${short(data.desc, 200)}`])
    }
    return text
}

function random_shuffle(array) {
    const temp = [...array]
    for (let i = temp.length - 1; i >= 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [temp[i], temp[j]] = [temp[j], temp[i]]
    }
    return temp
}

function pinyinEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        let flag = false
        check:
        for (let j = 0; j < a[i].length; j++) {
            for (let k = 0; k < b[i].length; k++) {
                if (a[i][j] === b[i][k]) {
                    flag = true
                    break check
                }
            }
        }
        if (!flag) return false
    }
    return true
}

export default {
    random,
    test,
    format,
    getInfo,
    getSettings,
    downloadFile,
    run_code,
    getOffset,
    formatDuration,
    fill,
    getBInfo,
    get,
    random_shuffle,
    pinyinEqual
}
