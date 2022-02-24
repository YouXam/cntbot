import { Db, ObjectId } from 'mongodb';
import config from './config'
import lib from './lib'

export class Questions {
    questions: Map<string, any> = new Map();
    db: Db;
    tag = false;
    qt_id = 0;
    deleteed: Map<string, boolean> = new Map()
    queue = []
    newquestions = []
    constructor(db) {
        this.db = db
    }
    async gettag() {
        const res = await this.db.collection('anime_tag').findOne()
        return res
    }
    async deltag() {
        const res = await this.gettag()
        if (res) await this.db.collection('anime_tag').deleteOne({ _id: res._id })
    }
    newgame() {
        this.queue = []
        for (let [k, v] of this.questions) {
            v.v = v.cnt ? (v.succeed || 0) / v.cnt : 0.9999
            if (v.succeed === v.cnt) v.v = 0.9999
            const x = Math.floor(3 * v.v)
            const y = x + 1
            for (let i = 0; i < y; i++) this.queue.push(v._id.toHexString())
            if (!v.cnt) this.newquestions.push(v._id.toHexString())
        }
        this.newquestions = lib.random_shuffle(this.newquestions)
        this.queue = lib.random_shuffle(this.queue)
        this.qt_id = 0
    }
    async update() {
        if (this.tag) {
            const res = await this.gettag()
            if (res) {
                res.delete.forEach(e => this.deleteed.set(e.toHexString(), true))
                res.add.forEach(async e => {
                    if (this.deleteed.get(e.toHexString())) return
                    const res = await this.db.collection('anime').findOne({ _id: e })
                    if (res) {
                        this.questions.set(e.toHexString(), res)
                        this.newquestions.push(e.toHexString())
                    }
                })
                await this.deltag()
            }
        } else {
            this.tag = true
            const questions = await this.db.collection('anime').find({}).project({ _id: 1, cnt: 1, succeed: 1 }).toArray();
            questions.forEach(question => {
                this.questions.set((question._id as ObjectId).toHexString(), question)
            })
            await this.deltag()
        }
        if (this.qt_id >= this.queue.length) this.newgame()
        while (this.newquestions.length > 0) {
            const v = this.newquestions.shift()
            if (!this.deleteed.get(v)) return await this.db.collection('anime').findOne({ _id: new ObjectId(v) })
        }
        while (true) {
            const v = this.queue[this.qt_id]
            if (++this.qt_id >= this.queue.length) this.newgame()
            if (!this.deleteed.get(v)) {
                return await this.db.collection('anime').findOne({ _id: new ObjectId(v) })
            }
        }
    }
    inc(id, succeed) {
        const now = this.questions.get((id as ObjectId).toHexString())
        now.cnt++
        now.succeed += succeed
        this.questions.set((id as ObjectId).toHexString(), now)
        this.db.collection('anime').updateOne({ _id: id }, { $inc: { cnt: 1, succeed } })
    }
}