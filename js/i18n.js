/* EN + UK + PT-BR + ES. Missing keys fall back to English. */
(function (root) {
  'use strict';
  var pack = {
    en: {
      go: 'GO', step: 'STEP', cash: 'CASH OUT', bet: 'BET', history: 'History', none: 'No rounds yet',
      pressGo: 'Press GO to descend', next: 'next', takeFirst: 'Bet {bet} — take the first step',
      cashOut: 'Cash out: {amt}', won: 'Won {amt}', lost: 'Lost {amt}',
      broke: 'tap + for coins', brokeLower: 'lower bet or tap +', brokeTitle: 'Not enough coins. Tap + for a free refill, or lower the bet.',
      notEnough: 'NOT ENOUGH COINS', notEnoughSub: 'Lower the bet or tap + for free coins',
      lava: 'INTO THE LAVA!', lavaSub: 'Slab {k} crumbled in {circle} · bet {bet} lost',
      refill: '+ FREE COINS', refillSub: 'Balance refilled to {n} (virtual)',
      idleCash: 'Step or take the gold?', idleStep: 'Take your first step!',
      auto: 'Auto', autoOff: 'Off', pick: 'Pick a slab first', stake: 'Stake mode: the slab is chosen before the bet. No cash-out mid-run.', possible: 'Possible win', ifHolds: 'if slab {n} holds',
      how: 'How to play', how1: 'GO steps onto the next slab. It can fall.', how2: 'CASH OUT any time after the first safe step. Space steps, C cashes out.', how3: 'A Golden Idol doubles this multiplier and every slab after it.', pickSlab: 'Pick a slab', slab: 'SLAB', stakeRule1: 'Pick the slab before you bet. GO plays the whole bet to that slab, or until one falls.', stakeRule2: 'There is no cash-out during the run. Reaching the slab pays the possible win. A fall loses the bet.', stakeRule3: 'The possible win is without a Golden Idol. An idol doubles that payout if it lands.',
      tip1: 'Press GO to step onto the next slab. It can hold, or it can fall.',
      tip2: 'After the first safe step, CASH OUT takes the gold. Space steps, C cashes out.',
      tip3: 'A Golden Idol doubles the multiplier, and every slab after it.',
      nextBtn: 'Next', gotIt: 'Got it', home: 'Lobby',
      round: 'Round', replay: 'Replay', close: 'Close',
      detail: 'Bet {bet} · {result} · {steps} steps · idols x{j}',
      demo: 'Demo, virtual coins only, no real money.', real: 'Real-money shell. Wallet is not connected.'
    },
    uk: {
      go: 'СТАРТ', step: 'КРОК', cash: 'ЗАБРАТИ', bet: 'СТАВКА', history: 'Історія', none: 'Раундів ще немає',
      pressGo: 'Натисни СТАРТ, щоб зійти', next: 'далі', takeFirst: 'Ставка {bet} — перший крок',
      cashOut: 'Забрати: {amt}', won: 'Виграш {amt}', lost: 'Програш {amt}',
      broke: 'натисни +', brokeLower: 'зменш ставку або +', brokeTitle: 'Не вистачає монет. Натисни + або зменш ставку.',
      notEnough: 'МАЛО МОНЕТ', notEnoughSub: 'Зменш ставку або натисни +',
      lava: 'У ЛАВУ!', lavaSub: 'Плита {k} впала в {circle} · ставка {bet} згоріла',
      refill: '+ МОНЕТИ', refillSub: 'Баланс поповнено до {n} (віртуальні)',
      idleCash: 'Крок чи забрати золото?', idleStep: 'Зроби перший крок!',
      auto: 'Авто', autoOff: 'Вимк', pick: 'Спочатку обери плиту', stake: 'Режим Stake: плита до ставки, без кешауту посеред раунду.', possible: 'Можливий виграш', ifHolds: 'якщо плита {n} встоїть',
      how: 'Як грати', how1: 'СТАРТ ставить на наступну плиту. Вона може впасти.', how2: 'ЗАБРАТИ можна після першого безпечного кроку. Пробіл — крок, C — кешаут.', how3: 'Золотий ідол подвоює множник і всі плити далі.', pickSlab: 'Обери плиту', slab: 'ПЛИТА', stakeRule1: 'Плиту обираєш до ставки. СТАРТ сам веде раунд до неї або до падіння.', stakeRule2: 'Посеред раунду забрати не можна. Дійшов до плити — отримуєш можливий виграш. Плита впала — ставка згоріла.', stakeRule3: 'Можливий виграш показаний без Золотого ідола. Якщо ідол випаде, виплата подвоюється.',
      tip1: 'Натисни СТАРТ. Плита або втримає, або впаде.',
      tip2: 'Після першого безпечного кроку ЗАБРАТИ забирає золото. Пробіл — крок, C — кешаут.',
      tip3: 'Золотий ідол подвоює множник і всі наступні плити.',
      nextBtn: 'Далі', gotIt: 'Зрозуміло', home: 'Лобі',
      round: 'Раунд', replay: 'Повтор', close: 'Закрити',
      detail: 'Ставка {bet} · {result} · кроків {steps} · ідоли x{j}',
      demo: 'Демо, лише віртуальні монети, без справжніх грошей.', real: 'Режим real. Гаманець не підключено.'
    },
    'pt-BR': {
      go: 'IR', step: 'PASSO', cash: 'SACAR', bet: 'APOSTA', history: 'Histórico', none: 'Nenhuma rodada ainda',
      pressGo: 'Aperte IR para descer', next: 'próx', takeFirst: 'Aposta {bet} — primeiro passo',
      cashOut: 'Sacar: {amt}', won: 'Ganhou {amt}', lost: 'Perdeu {amt}',
      broke: 'toque +', brokeLower: 'baixe a aposta ou +', brokeTitle: 'Moedas insuficientes. Toque + ou baixe a aposta.',
      notEnough: 'SEM MOEDAS', notEnoughSub: 'Baixe a aposta ou toque +',
      lava: 'NA LAVA!', lavaSub: 'Laje {k} caiu em {circle} · aposta {bet} perdida',
      refill: '+ MOEDAS', refillSub: 'Saldo recarregado para {n} (virtual)',
      idleCash: 'Passo ou pegar o ouro?', idleStep: 'Dê o primeiro passo!',
      auto: 'Auto', autoOff: 'Off', pick: 'Escolha a laje', stake: 'Modo Stake: a laje é escolhida antes da aposta. Sem saque no meio.', possible: 'Ganho possível', ifHolds: 'se a laje {n} segurar',
      how: 'Como jogar', how1: 'IR pisa na próxima laje. Ela pode cair.', how2: 'SACAR depois do primeiro passo seguro. Espaço avança, C saca.', how3: 'O ídolo dourado dobra este multiplicador e os seguintes.', pickSlab: 'Escolha a laje', slab: 'LAJE', stakeRule1: 'Escolha a laje antes da aposta. IR joga a aposta até essa laje, ou até uma cair.', stakeRule2: 'Não há saque no meio. Chegar na laje paga o ganho possível. Se cair, a aposta se perde.', stakeRule3: 'O ganho possível é sem ídolo. Se um ídolo sair, o pagamento dobra.',
      tip1: 'Aperte IR. A laje segura ou cai.',
      tip2: 'Depois do primeiro passo seguro, SACAR leva o ouro. Espaço avança, C saca.',
      tip3: 'O ídolo dourado dobra o multiplicador e as lajes seguintes.',
      nextBtn: 'Próximo', gotIt: 'Entendi', home: 'Lobby',
      round: 'Rodada', replay: 'Replay', close: 'Fechar',
      detail: 'Aposta {bet} · {result} · {steps} passos · ídolos x{j}',
      demo: 'Demo, só moedas virtuais, sem dinheiro real.', real: 'Modo real. Carteira não conectada.'
    },
    es: {
      go: 'IR', step: 'PASO', cash: 'COBRAR', bet: 'APUESTA', history: 'Historial', none: 'Aún no hay rondas',
      pressGo: 'Pulsa IR para bajar', next: 'sig', takeFirst: 'Apuesta {bet} — primer paso',
      cashOut: 'Cobrar: {amt}', won: 'Ganaste {amt}', lost: 'Perdiste {amt}',
      broke: 'pulsa +', brokeLower: 'baja la apuesta o +', brokeTitle: 'No hay monedas. Pulsa + o baja la apuesta.',
      notEnough: 'SIN MONEDAS', notEnoughSub: 'Baja la apuesta o pulsa +',
      lava: 'A LA LAVA!', lavaSub: 'Losa {k} cayó en {circle} · apuesta {bet} perdida',
      refill: '+ MONEDAS', refillSub: 'Saldo recargado a {n} (virtual)',
      idleCash: '¿Paso o cobrar el oro?', idleStep: 'Da el primer paso!',
      auto: 'Auto', autoOff: 'Off', pick: 'Elige la losa', stake: 'Modo Stake: la losa se elige antes de apostar. Sin cobro a mitad.', possible: 'Ganancia posible', ifHolds: 'si la losa {n} aguanta',
      how: 'Cómo jugar', how1: 'IR pisa la siguiente losa. Puede caer.', how2: 'COBRAR tras el primer paso seguro. Espacio avanza, C cobra.', how3: 'El ídolo de oro dobla este multiplicador y los siguientes.', pickSlab: 'Elige la losa', slab: 'LOSA', stakeRule1: 'Elige la losa antes de apostar. IR juega la apuesta hasta esa losa, o hasta que caiga una.', stakeRule2: 'No hay cobro a mitad. Llegar paga la ganancia posible. Si cae, la apuesta se pierde.', stakeRule3: 'La ganancia posible es sin ídolo. Si sale un ídolo, el pago se dobla.',
      tip1: 'Pulsa IR. La losa aguanta o cae.',
      tip2: 'Tras el primer paso seguro, COBRAR se lleva el oro. Espacio avanza, C cobra.',
      tip3: 'El ídolo de oro dobla el multiplicador y las losas siguientes.',
      nextBtn: 'Siguiente', gotIt: 'Listo', home: 'Lobby',
      round: 'Ronda', replay: 'Repetición', close: 'Cerrar',
      detail: 'Apuesta {bet} · {result} · {steps} pasos · ídolos x{j}',
      demo: 'Demo, solo monedas virtuales, sin dinero real.', real: 'Modo real. Billetera no conectada.'
    }
  };
  function t(key, vars) {
    var lang = (root.LAVA_CONFIG && root.LAVA_CONFIG.lang) || 'en';
    var s = (pack[lang] && pack[lang][key]) || pack.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  root.LavaI18n = { t: t, pack: pack };
})(this);
