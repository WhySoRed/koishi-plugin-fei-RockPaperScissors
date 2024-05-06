import { Context, Schema, Session, h } from 'koishi'
import {} from 'koishi-plugin-fei-nickname'
const fs_1 = require('fs');
const path_1 = require('path');

export const inject = {
        required: ['database'],
        optional: ['nickname'],
}

export const name = 'fei-r-p-s'

export interface Config {
    rpsTime: number;
    rpsWaitTime: number;
    rpsPreparedTime: number;
}

export const Config: Schema<Config> = Schema.object({
    rpsTime: Schema.number().default(10000).description('剪刀石头布游戏倒计时（毫秒）'),
    rpsWaitTime: Schema.number().default(60000).description('剪刀石头布等待对方同意的时间（毫秒）'),
    rpsPreparedTime: Schema.number().default(3000).description('剪刀石头布游戏准备时间（毫秒）'),
})

//数据库储存剪刀石头布获胜历史
declare module 'koishi' {
    interface Tables {
        rpsWinCount: RPSWinCount
    }
}
  
export interface RPSWinCount {
    uid: string;
    loserId: string;
    loserName: string;
    count: number;
}
  
export function apply(ctx: Context, config: Config) {
    const nicknameOn: boolean = !!ctx.nickname;
    const rpsTemp: {[key: string]: RpsTemp} = {};

    class RpsPlayer {
        id:string;
        name:string;
        choice:'剪刀'|'石头'|'布';
        choiceTime:number = 0;
        constructor(id:string) {
            this.id = id;
        }
    }

    class RpsTemp {
        player :[RpsPlayer, RpsPlayer];
        gamePrepared:boolean = false;
        gameBegun:boolean = false;
        endWait:Function;         //等待同意剪刀石头布的定时器
        endListion:Function;      //猜拳选择事件的监听器的取消函数
        endTimeout:Function;      //等待同意剪刀石头布的定时器
        constructor(player1Id: string, player2Id: string,
                    player1Name: string) {
            this.player = [new RpsPlayer(player1Id), new RpsPlayer(player2Id)];
            this.player[0].name = player1Name;
        }
    }

    ctx.model.extend('rpsWinCount', {
        uid: { type: "string", nullable:false },
        loserId: { type: "string", nullable:false },
        loserName: "string",
        count: { type: "unsigned", initial: 0}
    },{
        primary: ['uid', 'loserId']
    })

    ctx.command('剪刀石头布').alias('石头剪刀布')
    .action(async ({ session }, message) => {
        const rps = rpsTemp[session.cid];
        if(rps?.gameBegun) return '游戏已经在开始了';
        if(rps?.gamePrepared) return '现在正在有人邀请别人玩呀，你等一会~';
        if(h.select(message,'at').length != 1)
            return '请@一个人呀';
        else {
            //艾特自己
            if(h.select(message,'at')[0].attrs.id === session.event.user.id) return '你要和自己玩吗...那怎么行';
            //艾特机器人
            if(h.select(message,'at')[0].attrs.id === session.bot.selfId) {
                session.send('你要和我玩吗？好呀好呀~ 你出吧');
                const userInput = await session.prompt(30000);
                if(userInput === null) {
                    return('你不出吗？那就算了吧...');
                } else if(userInput === '剪刀' ||userInput === 'scissors' || userInput === 'Scissors' || /[(🤞)(✌)(✌🏻)(✌🏼️)(✌🏽️)(✌🏾️)(✌🏿️)(🖖)(🖖🏻)(🖖🏼️)(🖖🏽️)(🖖🏾️)(🖖🏿️)(✁)(✂)(✃)(✄)(✀)(✂️)]/.test(userInput))
                    return('我出 石头~你输啦');
                else if(userInput === '石头' || userInput === 'rock' || userInput === 'Rock' || /[(👊)(👊🏻)(👊🏼️)(👊🏽️)(👊🏾️)(👊🏿️)(✊)(✊🏻)(✊🏼️)(✊🏽️)(✊🏾️)(✊🏿️)(🤜)(🤜🏻)(🤜🏼️)(🤜🏽️)(🤜🏾️)(🤜🏿️)(🤛)(🤛🏻)(🤛🏼️)(🤛🏽️)(🤛🏾️)(🤛🏿️)]/.test(userInput))
                    return('我出 布~你输啦');
                else if(userInput === '布' || userInput === 'paper' || userInput === 'Paper' || /[(🖐)(🖐🏻)(🖐🏼️)(🖐🏽️)(🖐🏾️)(🖐🏿️)(✋)(✋🏻)(✋🏼️)(✋🏽️)(✋🏾️)(✋🏿️)(🤚)(🤚🏻)(🤚🏼️)(🤚🏽️)(🤚🏾️)(🤚🏿️)(👋)(👋🏻)(👋🏼️)(👋🏽️)(👋🏾️)(👋🏿️)]/.test(userInput))
                    return('我出 剪刀~你输啦');
                else return('你出什么？我不认识诶');
            }
            const rps = (rpsTemp[session.cid] = new RpsTemp(session.event.user.id, h.select(message,'at')[0].attrs.id, (nicknameOn? (await ctx.nickname.getNick(session)) as string: session.event.user.name)));
            rps.gamePrepared = true;
            rps.endWait = ctx.on('message' , async ( session ) => {
                if(h.select(session.content, 'text')[0].attrs.content !== '同意')
                    return;
                if(session.event.user.id == rps.player[1].id) {
                    //取消超时的计时器和同意的监听
                    rps.endWait();
                    rps.endTimeout(); 
                    //在准备时间结束后可以出
                    ctx.setTimeout(()=> {
                        startGame(session);
                    }, config.rpsPreparedTime)
                    session.send(h.at(rps.player[0].id) +' '+ h.at(rps.player[1].id) +' 游戏就要开始咯~请做好准备，' + config.rpsPreparedTime/1000 + '秒后游戏将会开始');
                }
                //自己同意
                else if(session.event.user.id == rps.player[0].id) {
                    session.send('你很孤独吗...一定有人会愿意陪你的...');
                }
                //其他人同意
                else
                    session.send(h.at(session.event.user.id) + ' 你不要掺和啦...');
            })
        
            rps.endTimeout = ctx.setTimeout(()=> {
                rps.endWait();
                delete rpsTemp[session.cid];
                session.send('对方没有回应，游戏取消');
            }, config.rpsWaitTime);
        }
        return message + ' ' + (nicknameOn? (await ctx.nickname.getNick(session, h.select(message,'at')[0].attrs.id)): '')  + '~要玩剪刀石头布吗？如果同意的话，请发送"同意"~'
    })
    .usage(`
剪刀石头布 @某人 或
石头剪刀布 @某人
请对方和自己玩石头剪刀布~
可以慢出也可以改出，但不出会输哟`)

    async function startGame(session:Session) {
        const rps = rpsTemp[session.cid];

        rps.gamePrepared = false;
        rps.gameBegun = true;
        rps.player[1].name = (nicknameOn? await ctx.nickname.getNick(session) as string: session.event.user.name);

        rps.endListion = ctx.on('message', (session) => {
            if(session.event.user.id == rps.player[0].id ||
                session.event.user.id == rps.player[1].id)
                changeChoice(session);
        })

        ctx.setTimeout(()=> {
            rps.endListion();
            settle(session);
            rps.gameBegun = false;
        }, config.rpsTime);

        session.send('游戏开始！限时' + config.rpsTime/1000 + '秒~\n请发送 剪刀 石头 布 选择你的出拳')
    }

    async function changeChoice(session:Session) {
        const rps = rpsTemp[session.cid];
        const player = rps.player[(rps.player[0].id === session.event.user.id ? 0 : 1)];
        if(session.content === '剪刀' ||
            session.content === 'scissors' ||
            session.content === 'Scissors' ||
            /[(🤞)(✌)(✌🏻)(✌🏼️)(✌🏽️)(✌🏾️)(✌🏿️)(🖖)(🖖🏻)(🖖🏼️)(🖖🏽️)(🖖🏾️)(🖖🏿️)(✁)(✂)(✃)(✄)(✀)(✂️)]/.test(session.content)
        ) player.choice = '剪刀';
        else if(session.content == '石头' ||
            session.content == 'rock' ||
            session.content == 'Rock' ||
            /[(👊)(👊🏻)(👊🏼️)(👊🏽️)(👊🏾️)(👊🏿️)(✊)(✊🏻)(✊🏼️)(✊🏽️)(✊🏾️)(✊🏿️)(🤜)(🤜🏻)(🤜🏼️)(🤜🏽️)(🤜🏾️)(🤜🏿️)(🤛)(🤛🏻)(🤛🏼️)(🤛🏽️)(🤛🏾️)(🤛🏿️)]/.test(session.content)
        ) player.choice = '石头';
        else if(session.content == '布' ||
            session.content == 'paper' ||
            session.content == 'Paper' ||
            /[(🖐)(🖐🏻)(🖐🏼️)(🖐🏽️)(🖐🏾️)(🖐🏿️)(✋)(✋🏻)(✋🏼️)(✋🏽️)(✋🏾️)(✋🏿️)(🤚)(🤚🏻)(🤚🏼️)(🤚🏽️)(🤚🏾️)(🤚🏿️)(👋)(👋🏻)(👋🏼️)(👋🏽️)(👋🏾️)(👋🏿️)]/.test(session.content)
        ) player.choice = '布';
        else return;
        if(player.choiceTime++ == 0)
            session.send(player.name + ' 出 ' + player.choice);
        else 
            session.send(player.name + ' 改成了 ' + player.choice);
    }
    //结算
    async function settle(session:Session) {
        const rps = rpsTemp[session.cid];
        let winer:boolean; //0/1 : 玩家 undefined: 平局
        if(rps.player[0].choice === rps.player[1].choice) {}
        else if(rps.player[0].choice === undefined) 
            winer = true; 
        else if(rps.player[1].choice === undefined)
            winer = false;
        else if(rps.player[0].choice === '剪刀') {
            if(rps.player[1].choice === '石头') winer = true;
            else if(rps.player[1].choice === '布') winer = false;
        }
        else if(rps.player[0].choice === '石头') {
            if(rps.player[1].choice === '布') winer = true;
            else if(rps.player[1].choice === '剪刀') winer = false;
        }
        else if(rps.player[0].choice === '布') {
            if(rps.player[1].choice === '剪刀') winer = true;
            else if(rps.player[1].choice == '石头') winer = false;
        }
        session.send('游戏时间到~\n' +
                    rps.player[0].name + '的结果是 ' + (rps.player[0].choice === undefined?'啥也没出': rps.player[0].choice) + '\n' +
                    rps.player[1].name + '的结果是 ' + (rps.player[1].choice === undefined?'啥也没出': rps.player[1].choice) + '\n' + 
                    (winer === undefined? '平局': (winer? rps.player[1].name + ' 赢了': rps.player[0].name + ' 赢了')) + '~');
        if (winer !== undefined) {
            const uid = session.platform + ':' + rps.player[+winer].id;
            const count = (await ctx.database.get('rpsWinCount',{ uid, loserId: rps.player[+!winer].id }))[0]?.count || 0;
            await ctx.database.upsert('rpsWinCount', [{ uid, loserId: rps.player[+!winer].id, loserName: rps.player[+!winer].name, count: count + 1 }]);
        }
    }

    ctx.command('剪刀石头布记录 [页数]').alias('石头剪刀布记录')
    .action(async ({ session }, page) => {
        const uid = session.uid;
        const offsetIndex = (page? 10 * (+page - 1): 0);
        const winRecord = await ctx.database.select('rpsWinCount')
                                            .where( { uid } )
                                            .limit(10)
                                            .offset(offsetIndex)
                                            .execute();
        if(winRecord.length === 0) {
            return page? '本页没有记录了': '没有记录';
        }
        else {
            const winText = JSON.parse(await fs_1.readFileSync(path_1.join(__dirname,'/RpsShowText.json'))).winText;
            const getNickGiven = async (recond:any) => {
                if(nicknameOn) {
                    return await ctx.nickname.getNickGiven(session, recond.loserId);
                }
                else return recond.loserName;
            }
            return `你的剪刀石头布记录：\n` + await Promise.all(winRecord.map(async (record) => {
                const [loser, count] = [await getNickGiven(record), record.count];
                const randomWinText = winText[Math.floor(Math.random() * winText.length)];
                return randomWinText.replace(/\${loser}/g, loser).replace(/\${count}/g, count) + '\n';
            }))
        }
    })
}