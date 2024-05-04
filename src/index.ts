import { Context, Schema, Session, h } from 'koishi'

export const name = 'fei-r-p-s'

export interface Config {
    rpsTime: number;
    rpsWaitTime: number;
    rpsPreparedTime: number;
}

export const Config: Schema<Config> = Schema.object({
    rpsTime: Schema.number().default(10000).description('剪刀石头布游戏倒计时（毫秒）'),
    rpsWaitTime: Schema.number().default(600000).description('剪刀石头布等待对方同意的时间（毫秒）'),
    rpsPreparedTime: Schema.number().default(3000).description('剪刀石头布游戏准备时间（毫秒）'),
})

export function apply(ctx: Context, config: Config) {
    const rpsTemp: {[key: string]: Rps} = {};

    class RpsPlayer {
        id:string;
        name:string;
        choice:'剪刀'|'石头'|'布';
        choiceTime:number = 0;
        constructor(id:string) {
            this.id = id;
        }
    }

    class Rps {
        player :[RpsPlayer, RpsPlayer];
        gamePrepared:boolean = false;
        gameBegun:boolean = false;
        endListion:Function;      //猜拳选择事件的监听器的取消函数
        endTimeout:Function;      //等待同意剪刀石头布的定时器
        constructor(player1Id: string, player2Id: string,
                    player1Name: string) {
            this.player = [new RpsPlayer(player1Id), new RpsPlayer(player2Id)];
            this.player[0].name = player1Name;
        }
    }

    ctx.command('剪刀石头布').alias('石头剪刀布')
    .action(async ({ session }, message) => {
        const rps = rpsTemp[session.cid];
        if(rps?.gameBegun) return '游戏已经在开始了';
        if(rps?.gamePrepared) return '本群当前有一局游戏在准备阶段呀';
        if(h.select(message,'at').length != 1)
            return '请@对方呀';
        else {
            if(h.select(message,'at')[0].attrs.id === session.event.user.id) return '你要和自己玩吗...那怎么行';
            if(h.select(message,'at')[0].attrs.id === session.bot.selfId) {
                session.send('你要和我玩吗？好呀好呀~');
                const userInput = await session.prompt(30000);
                if(userInput === null) {
                    return('你不出吗？那就算了吧...');
                } else if(userInput === '剪刀' || userInput === '✂' || userInput === '✌' || userInput === '✂️' ||userInput === 'scissors' || userInput === 'Scissors')
                    return('我出 石头~你输啦');
                else if(userInput === '石头' || userInput === '✊' || userInput === '👊' || userInput === 'rock' || userInput === 'Rock')
                    return('我出 布~你输啦');
                else if(userInput === '布' || userInput === '🖐' || userInput === '✋' || userInput === 'paper' || userInput === 'Paper')
                    return('我出 剪刀~你输啦');
                else return('你出什么？我不认识诶');
            }
            const rps = rpsTemp[session.cid] = new Rps(session.event.user.id, h.select(message,'at')[0].attrs.id, session.event.user.name);
            rps.gamePrepared = true;
            rps.endTimeout = ctx.setTimeout(()=> {
                delete rpsTemp[session.cid];
                session.send('对方没有回应，游戏取消');
            }, config.rpsWaitTime);
        }
        return message + ' 如果同意的话请发送 同意'
    })

    ctx.command('同意剪刀石头布').alias('同意石头剪刀布','石头剪刀布同意','剪刀石头布同意')
    .action(async ({ session }, message) => {
        const rps = rpsTemp[session.cid];
        if(rps.gamePrepared === undefined || !rps.gamePrepared) return '游戏未准备好';
        else if(session.event.user.id == rps.player[1].id) {
            rps.endTimeout();
            ctx.setTimeout(()=> {
                startGame(session);
            }, config.rpsPreparedTime)
            return '游戏就要开始咯~请做好准备，' + config.rpsPreparedTime/1000 + '秒后游戏将会开始';
        }
    })

    async function startGame(session:Session) {
        const rps = rpsTemp[session.cid];

        rps.gamePrepared = false;
        rps.gameBegun = true;
        rps.player[1].name = session.event.user.name;

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
        if(session.content == '剪刀' ||
                session.content == '✂' ||
                session.content == '✌' ||
                session.content == '✂️' ||
                session.content == 'scissors' ||
                session.content == 'Scissors'
            ) player.choice = '剪刀';
            else if(session.content == '石头' ||
                session.content == '✊' ||
                session.content == '👊' ||
                session.content == 'rock' ||
                session.content == 'Rock'
            ) player.choice = '石头';
            else if(session.content == '布' ||
                session.content == '🖐' ||
                session.content == '✋' ||
                session.content == 'paper' ||
                session.content == 'Paper'
            ) player.choice = '布';
        if( player.choiceTime++ == 0)
            session.send(player.name + ' 出 ' + player.choice);
        else 
            session.send(player.name + ' 改成了 ' + player.choice);
    }
    //结算
    async function settle(session:Session) {
        const rps = rpsTemp[session.cid];
        let settleMessage = '';
        if(rps.player[0].choice == rps.player[1].choice) {
            settleMessage = '平局';
        }
        else if(rps.player[0].choice == '剪刀') {
            if(rps.player[1].choice == '石头') settleMessage = rps.player[1].name + '获胜';
            else if(rps.player[1].choice == '布') settleMessage = rps.player[0].name + '获胜';
        }
        else if(rps.player[0].choice == '石头') {
            if(rps.player[1].choice == '剪刀') settleMessage = rps.player[0].name + '获胜';
            else if(rps.player[1].choice == '布') settleMessage = rps.player[1].name + '获胜';
        }
        else if(rps.player[0].choice == '布') {
            if(rps.player[1].choice == '剪刀') settleMessage = rps.player[1].name + '获胜';
            else if(rps.player[1].choice == '石头') settleMessage = rps.player[0].name + '获胜';
        }
        else if(rps.player[0].choice === undefined) 
            settleMessage = rps.player[0].name + '未出，' + rps.player[1].name + '获胜'; 
        else if(rps.player[1].choice === undefined)
            settleMessage = rps.player[1].name + '未出，' + rps.player[0].name + '获胜';
        session.send(rps.player[0].name + ': ' + rps.player[0].choice + '\n' +
                    rps.player[1].name + ': ' + rps.player[1].choice + '\n' + 
                    settleMessage + '~');
    }
}