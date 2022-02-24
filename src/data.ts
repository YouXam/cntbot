import { Collection, Db, MongoClient, ObjectId } from "mongodb"

interface settings {
    /**
     * 是否在排行榜显示 QQ 号
     */
    public: string
}

export interface user {
    /** 昵称 */
    name: string
    /** QQ 号 */
    id: number
    /** 上一次签到时间 */
    last: Date
    /** 设置 */
    settings: settings
    /** 现有点数 */
    total: number
    /** 签到次数 */
    sign: number
    /** 签到获得的点数 */
    signPoint: number
    /** 交易获得的点数 */
    exchange: number
    /** 接收次数 */
    receive: number
    /** 发送次数 */
    send: number
    /** 抽奖次数 */
    lot: number
    /** 抽奖获得的点数 */
    lotPoint: number
    /** 抢红包次数 */
    luy: number
    /** 抢红包获得的点数 */
    luyPoint: number
    /** 抢劫次数 */
    rob: number
    /** 被抢劫次数 */
    robed: number
    /** 抢劫获得的点数 */
    robPoint: number
    /** 猜词次数 */
    guess: number
    /** 猜词成功次数 */
    guessSuccess: number
    /** 猜动漫体力 */
    agTimes: number

}

const users_cache: Map<number, user> = new Map()

class User implements user {
    name: string;
    id: number;
    last: Date;
    settings: settings;
    total: number;
    sign: number;
    signPoint: number;
    exchange: number;
    receive: number;
    send: number;
    db: Collection;
    isnew: boolean;
    lot: number;
    lotPoint: number;
    luy: number;
    luyPoint: number;
    rob: number;
    robed: number;
    robPoint: number;
    agTimes: number;
    constructor(id: number, name: string, db: Collection) {
        this.id = id
        this.name = name
        this.db = db
        this.isnew = true
    }
    guess: number;
    guessSuccess: number;
    async create(cache: boolean = true) {
        let res: user
        if (cache) {
            res = users_cache.get(this.id)
        } else {
            res = (await this.db.findOne({ id: this.id })) as unknown as user
            users_cache.set(this.id, res)
        }
        if (!res) {
            this.last = new Date('2004-07-17')
            this.settings = {
                public: 'false'
            }
            this.total = 0
            this.sign = 0
            this.signPoint = 0
            this.exchange = 0
            this.receive = 0
            this.send = 0
            this.lot = 0
            this.lotPoint = 0
            this.luy = 0
            this.luyPoint = 0
            this.rob = 0
            this.robed = 0
            this.robPoint = 0
            this.guess = 0
            this.guessSuccess = 0
            this.agTimes = 0
        } else {
            this.isnew = false
            this.last = new Date(res.last || '')
            this.settings = res.settings || {
                public: 'false'
            }
            this.total = res.total || 0
            this.sign = res.sign || 0
            this.signPoint = res.signPoint || 0
            this.exchange = res.exchange || 0
            this.receive = res.receive || 0
            this.send = res.send || 0
            this.lot = res.lot || 0
            this.lotPoint = res.lotPoint || 0
            this.luy = res.luy || 0
            this.luyPoint = res.luyPoint || 0
            this.rob = res.rob || 0
            this.robed = res.robed || 0
            this.robPoint = res.robPoint || 0
            this.guess = res.guess || 0
            this.guessSuccess = res.guessSuccess || 0
            this.agTimes = res.agTimes || 0
            if (!this.name) this.name = res.name
        }
    }
    async save() {
        const data: user = {
            name: this.name,
            id: this.id,
            last: this.last,
            settings: this.settings,
            total: this.total,
            sign: this.sign,
            signPoint: this.signPoint,
            exchange: this.exchange,
            receive: this.receive,
            send: this.send,
            lot: this.lot,
            lotPoint: this.lotPoint,
            luy: this.luy,
            luyPoint: this.luyPoint,
            rob: this.rob,
            robed: this.robed,
            robPoint: this.robPoint,
            guess: this.guess,
            guessSuccess: this.guessSuccess,
            agTimes: this.agTimes
        }
        users_cache.set(this.id, data)
        if (this.isnew) await this.db.insertOne(data)
        else await this.db.updateOne({ id: this.id }, { $set: data })
    }
}

export default class Data {
    db: Db;
    async connect(databse: string) {
        const client = new MongoClient(databse);
        await client.connect();
        this.db = client.db("cntbot");
        (await this.db.collection('cntbot').find().toArray()).forEach(e => users_cache.set(e.id, e as unknown as user))
    }
    async user(id: number, name: string = null, cache: boolean = true) {
        const res = new User(id, name, this.db.collection('cntbot'))
        await res.create(cache)
        return res
    }
    test(id: number) {
        return users_cache.has(id)
    }
}