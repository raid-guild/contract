require("typescript.api").register();
import Arweave from 'arweave/node';
import * as fs from 'fs';
import { StateInterface } from '../faces';
import { createContractExecutionEnvironment } from '../swglobal/contract-load';

const arweave = Arweave.init({
  host: 'arweave.net',
  protocol: 'https',
  port: 443
});

const { handle } = require('../contract.ts');
let state: StateInterface = JSON.parse(fs.readFileSync('./src/contract.json', 'utf8'));

let { handler, swGlobal } = createContractExecutionEnvironment(arweave, handle.toString(), 'BjRtuJ9i_Vr_Z14WvGPTcbqRcH98mNE8A2LYlYw19Jg');

const addresses = {
  admin: 'XacJBWnPmWEHUixZepCPGc-DJD7jDn1CiZ99UAKpkIk',
  user: 'KWn-0l96Ss_lHheS1cjDY5N-94SHyxAQO8Wfy1ehPu0',
  nonuser: 'DiFv0MDBxKEFkJEy_KNgJXNG6mxxSTcxgV0h4gzAgsc'
};

describe('Transfer Balances', () => {
  const func = 'transfer';

  it(`should transfer from ${addresses.admin} to ${addresses.user}`, () => {
    handler(state, {input: {
      function: func,
      target: addresses.user,
      qty: 1000
    }, caller: addresses.admin});
  
    expect(Object.keys(state.balances).length).toBe(4);
    expect(state.balances[addresses.admin]).toBe(2498000);
    expect(state.balances[addresses.user]).toBe(2501000);
  });

  it('should fail, invalid address', () => {
    try {
      handler(state, {input: {
        function: func,
        target: addresses.user,
        qty: 100
      }, caller: addresses.nonuser});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.balances[addresses.user]).toBe(2501000);
    expect(state.balances[addresses.nonuser]).toBeUndefined();
  });

  it('should fail with not enough balance', () => {
    try {
      handler(state, {input: {
        function: func,
        target: addresses.nonuser,
        qty: 2502000
      }, caller: addresses.user})
    } catch(err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.balances[addresses.user]).toBe(2501000);
    expect(state.balances[addresses.nonuser]).toBeUndefined();
  });

  it('should fail with same target and caller', () => {
    try {
      handler(state, {input: {
        function: func,
        target: addresses.user,
        qty: 1000
      }, caller: addresses.user});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.balances[addresses.user]).toBe(2501000);
  });

  it(`should transfer from ${addresses.user} to ${addresses.admin}`, () => {
    handler(state, {input: {
      function: 'transfer',
      target: addresses.admin,
      qty: 1000
    }, caller: addresses.user});

    expect(state.balances[addresses.user]).toBe(2500000);
    expect(state.balances[addresses.admin]).toBe(2499000);
  });
});

describe('Get account balances', () => {
  const func = 'balance';

  it(`should get the balance for ${addresses.admin}`, async () => {
    const res = await handler(state, {input: {
      function: func,
      target: addresses.admin
    }, caller: addresses.admin});

    expect(res.result.target).toBe(addresses.admin);
    expect(res.result.balance).toBe(2500000);
  });

  it(`should get the unlocked balance for ${addresses.admin}`, async () => {
    const res = await handler(state, {input: {
      function: 'unlockedBalance',
      target: addresses.admin
    }, caller: addresses[3]});

    expect(res.result.target).toBe(addresses.admin);
    expect(res.result.balance).toBe(2499000);
  });

  it(`should get the balance for ${addresses.user}`, async () => {
    const res = await handler(state, {input: {
      function: func,
      target: addresses.user
    }, caller: addresses.admin});

    expect(res.result.target).toBe(addresses.user);
    expect(res.result.balance).toBe(2500000);
  });

  it(`should get an error, account doesn't exists.`, async () => {
    try {
      const res = await handler(state, {input: {
        function: func,
        target: addresses[3]
      }, caller: addresses.admin});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
    
    expect(state.balances[addresses[3]]).toBeUndefined();
  });
});

// Had to update SmartWeave to have a custom nonce for these tests.
describe('Locking system', () => {
  const bal = 100;
  const lockLength = 5;

  it('should increase the locked tokens length', () => {
    handler(state, { input: { 
      function: 'increaseVault',
      id: 0,
      lockLength: 101
    }, caller: addresses.admin});

    expect(state.vault[addresses.admin][0].end).toBe(101);

    handler(state, { input: { 
      function: 'increaseVault',
      id: 0,
      lockLength: 100
    }, caller: addresses.admin});

    expect(state.vault[addresses.admin][0].end).toBe(100);
  });

  it(`should not lock ${bal} from ${addresses.admin}`, () => {
    try {
      handler(state, {input: {
        function: 'lock',
        qty: bal,
        lockLength: 1,
      }, caller: addresses.admin});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.vault[addresses.admin].length).toBe(1);
  });

  it(`should lock ${bal} from ${addresses.admin}`, () => {
    const prevBal = state.balances[addresses.admin];

    handler(state, {input: {
      function: 'lock',
      qty: bal,
      lockLength
    }, caller: addresses.admin});

    expect(state.vault[addresses.admin].length).toBe(2);
    expect(state.vault[addresses.admin][1]).toEqual({
      balance: bal,
      end: swGlobal.block.height + lockLength,
      start: 0
    });
    expect(state.balances[addresses.admin]).toBe((prevBal - bal));
  });

  it('should not allow unlock', () => {
    handler(state, {input: {function: 'unlock'}, caller: addresses.admin});
    expect(state.vault[addresses.admin].length).toBe(2);
  });

  it('should not allow unlock', () => {
    swGlobal.block.increment();
    try {
      handler(state, {input: {function: 'unlock'}, caller: addresses.admin});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
    expect(state.vault[addresses.admin].length).toBe(2);
  });

  it('should allow unlock', () => {
    const prevBal = state.balances[addresses.admin];

    for(let i = 0; i < 4; i++) {
      swGlobal.block.increment();
    }
    handler(state, {input: {function: 'unlock'}, caller: addresses.admin});
    expect(state.vault[addresses.admin].length).toBe(1);
    expect(state.balances[addresses.admin]).toBe((prevBal + bal));
  });

  it('should allow a lock without giving a target', () => {
    const lockLength = 5;
    const prevBal = state.balances[addresses.admin];
    const bal = 5;

    handler(state, {input: {
      function: 'lock',
      qty: bal,
      lockLength
    }, caller: addresses.admin});

    expect(state.vault[addresses.admin].length).toBe(2);
    expect(state.balances[addresses.admin]).toBe(prevBal - bal);
  });

  it('should not allow unlock', () => {
    handler(state, {input: {function: 'unlock'}, caller: addresses.admin});
    expect(state.vault[addresses.admin].length).toBe(2);
  });

  it('should allow 1 unlock', () => {
    for(let i = 0; i < 5; i++) {
      swGlobal.block.increment();
    }
    handler(state, {input: {function: 'unlock'}, caller: addresses.admin});
    expect(state.vault[addresses.admin].length).toBe(1);
  });

  it('should return the account balances', async () => {
    const resultObj = {
      target: addresses.admin,
      balance: 1000
    };

    const res1 = await handler(state, {input: {function: 'vaultBalance'}, caller: addresses.admin});
    const res2 = await handler(state, {input: {function: 'vaultBalance', target: addresses.user}, caller: addresses.admin});
    expect(res1.result).toEqual({
      target: addresses.admin,
      balance: 1000
    });

    expect(res2.result).toEqual({
      target: addresses.user,
      balance: 0
    });
  });
});


describe('Propose a vote', () => {
  const func = 'propose';

  it('should fail, not locked balance', () => {
    try {
      handler(state, { input: {
        function: func,
        type: 'mint',
        recipient: addresses.user,
        qty: 100,
        note: 'Mint 100'
      }, caller: addresses.user});
    
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes.length).toBe(0);
  });

  it('should fail, not part of the DAO', () => {
    try {
      handler(state, { input: {
        function: func,
        type: 'mint',
        recipient: addresses.nonuser,
        qty: 100,
        note: 'Mint 100'
      }, caller: addresses.nonuser});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes.length).toBe(0);
  });

  it('should fail, invalid vote type DAO', () => {
    try {
      handler(state, { input: {
        function: func,
        type: 'invalidFunction',
        recipient: addresses.user,
        qty: 100,
        note: 'Mint 100'
      }, caller: addresses.admin});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes.length).toBe(0);
  });

  it('should create a mint proposal', () => {
    handler(state, { input: {
      function: func,
      type: 'mint',
      recipient: addresses.user,
      qty: 100,
      note: 'Mint 100'
    }, caller: addresses.admin });

    expect(state.votes.length).toBe(1);
  });

  it('should fail to create a mint proposal because of quantity', () => {
    try {
      handler(state, {
        input: {
          function: func,
          type: 'mint',
          recipient: addresses.user,
          qty: Number.MAX_SAFE_INTEGER + 100,
          note: 'Mint too much'
        }, caller: addresses.admin
      });
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes.length).toBe(1);
  });

  it('should create a mintLocked proposal', () => {
    handler(state, { input: {
      function: func,
      type: 'mintLocked',
      recipient: addresses.user,
      qty: 100,
      note: 'Mint 100'
    }, caller: addresses.admin });

    expect(state.votes.length).toBe(2);
  });

  it('should create a set quorum proposal', () => {
    handler(state, { input: {
      function: func,
      type: 'set',
      key: 'quorum',
      value: 0.3,
      note: 'Mint 100'
    }, caller: addresses.admin });

    expect(state.votes.length).toBe(3);
  });

  it('should create a inidicative proposal', () => {
    handler(state, { input: {
      function: func,
      type: 'indicative',
      note: 'Let\'s do this and that.'
    }, caller: addresses.admin });

    expect(state.votes.length).toBe(4);
  });

  it('should not create a set proposal for balances', () => {
    try {
      handler(state, { input: {
        function: func,
        type: 'set',
        key: 'balances',
        value: ['random'],
        note: 'Unable to set proposal balances.'
      }, caller: addresses.admin });
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.balances[addresses.admin]).toBeDefined();
  });

  it('should create a set proposal for a role', () => {
    handler(state, { input: {
      function: func,
      type: 'set',
      key: 'role',
      recipient: addresses.admin,
      value: 'MAIN',
      note: 'Set a role MAIN to main addy'
    }, caller: addresses.admin});

    expect(state.votes[(state.votes.length - 1)].value).toEqual('MAIN');
  });

  it('should create a set proposal for a custom field', () => {
    let voteLength = state.votes.length;

    try {
      handler(state, {input: {
        function: func,
        type: 'set',
        key: 'customKey',
        value: ['custom', 'value'],
        note: 'This is my custom field note.'
      }, caller: addresses.admin});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes.length).toBe(voteLength+1);
  });
});

describe('Votes', () => {
  const func = 'vote';

  it('should fail, not enough locked balance', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 0,
        cast: 'yay'
      }, caller: addresses.user});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes[0].yays).toBe(0);
    expect(state.votes[1].nays).toBe(0);
  });

  it('should fail, not part of the DAO', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 0,
        cast: 'yay'
      }, caller: addresses.nonuser});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes[0].yays).toBe(0);
    expect(state.votes[1].nays).toBe(0);
  });

  it('should vote yes on proposal', () => {
    handler(state, { input: {
      function: func,
      id: 0,
      cast: 'yay'
    }, caller: addresses.admin});

    expect(state.votes[0].yays).toBe(100000);
    expect(state.votes[0].nays).toBe(0);
  });

  it('should vote no on proposal', () => {
    handler(state, { input: {
      function: func,
      id: 1,
      cast: 'nay'
    }, caller: addresses.admin});

    expect(state.votes[1].yays).toBe(0);
    expect(state.votes[1].nays).toBe(100000);
  });

  it('should fail, already voted', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 0,
        cast: 'yay'
      }, caller: addresses.admin});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes[0].yays).toBe(100000);
    expect(state.votes[0].nays).toBe(0);
  });

  it('should fail, voter locked amount is over', () => {
    handler(state, { input: {
      function: 'lock',
      qty: 50,
      lockLength: 10
    }, caller: addresses.user});

    swGlobal.block.increment(50);

    try { 
      handler(state, { input: {
        function: func,
        id: 0,
        cast: 'nay'
      }, caller: addresses.user});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes[0].nays).toBe(0);
  });

  it('should fail, locked balance was after proposal creation', () => {
    swGlobal.block.increment();

    handler(state, {input: {function: 'transfer', qty: 100, target: addresses.user}, caller: addresses.admin});
    handler(state, {input: {function: 'lock', qty: 100, lockLength: 10}, caller: addresses.user});

    try {
      handler(state, { input: { function: func, id: 2, cast: 'yay'}, caller: addresses.user});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
    
    expect(state.votes[2].yays).toBe(0);
  });

  it('should fail, vote period is over', () => {
    swGlobal.block.increment(2160);

    handler(state, { input: {
      function: 'lock',
      qty: 50,
      lockLength: 10
    }, caller: addresses.user});

    try {
      handler(state, { input: {
        function: func,
        id: 0,
        cast: 'nay'
      }, caller: addresses.user});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.votes[0].nays).toBe(0);
  });
});

describe('Finalize votes', () => {
  it('should finalize a mint vote', () => {
    handler(state, { input: {
      function: 'finalize',
      id: 0
    }, caller: addresses.admin });
    
    expect(state.votes[0].status).toBe('passed');
  });

  it('should finalize a mintLocked with status failed', () => {
    handler(state, { input: {
      function: 'finalize',
      id: 1
    }, caller: addresses.admin });

    expect(state.votes[1].status).toBe('failed');
  });

  it('should finalize an indicative with status quorumFailed', () => {
    // Increment to allow the proposal
    swGlobal.block.increment();
    
    handler(state, {input: { function: 'propose', type: 'indicative', note: 'My note'}, caller: addresses.user});
    handler(state, {input: {function: 'vote', id: (state.votes.length - 1), cast: 'yay'}, caller: addresses.user});
    swGlobal.block.increment(2160);
    handler(state, { input: {function: 'finalize', id: (state.votes.length - 1)}, caller: addresses.user});

    expect(state.votes[(state.votes.length - 1)].status).toBe('quorumFailed');
  });

  it('should finalize and set a role', () => {
    // Manually faking a locked balance.
    state.vault[addresses.admin][0].end = 1000000;

    handler(state, {input: { 
      function: 'propose', 
      type: 'set', 
      key: 'role',
      recipient: addresses.admin,
      value: 'MAIN',
      note: 'role'
    }, caller: addresses.user});

    const lastVoteId = state.votes.length - 1;
    handler(state, {input: {function: 'vote', id: lastVoteId, cast: 'yay'}, caller: addresses.admin});
    swGlobal.block.increment(2160);
    handler(state, {input: {function: 'finalize', id: lastVoteId}, caller: addresses.user});

    expect(state.roles[addresses.admin]).toBe('MAIN');
  });
});

describe('Transfer locked', () => {
  it(`should fail with invalid address`, async () => {
    try {
      handler(state, {input: {
        function: 'transferLocked',
        target: 'u2ikdjhsoijem',
        qty: 100,
        lockLength: 10
      }, caller: addresses.user});
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }

    expect(state.vault['u2ikdjhsoijem']).toBeUndefined();
  });

  it(`should transfer locked balance`, async () => {
    const totalVault = Object.keys(state.vault[addresses.admin]).length;
    handler(state, {input: {
      function: 'transferLocked',
      target: addresses.admin,
      qty: 100,
      lockLength: 10
    }, caller: addresses.user});

    expect(Object.keys(state.vault[addresses.admin]).length).toBe((totalVault+1));
  });
});

// ConsensusTrade Tests
describe('Create new market', () => {
  const func = 'createMarket';

  it('should create a new market', () => {
    handler(state, { input: {
      function: func,
      tweet: 'Tweet 1',
      tweetUsername: '@ECWireless',
      tweetPhoto: 'https://pbs.twimg.com/profile_images/3240741454/9080e76653a80e43ae2058432bc76806_400x400.jpeg',
      tweetCreated: 1613590964209,
      tweetLink: 'https://twitter.com/BiIIMurray/status/437367711723978752'
    }, caller: addresses.admin });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].tweet).toBe('Tweet 1');
  });

  it('should fail, tweet format not recognized', () => {
    try {
      handler(state, { input: {
        function: func,
        tweet: 1,
        tweetUsername: '@ECWireless',
        tweetPhoto: 'https://pbs.twimg.com/profile_images/3240741454/9080e76653a80e43ae2058432bc76806_400x400.jpeg',
        tweetCreated: 1234567890,
        tweetLink: 'https://twitter.com/BiIIMurray/status/437367711723978752'
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].tweet).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should fail, tweetUsername format not recognized', () => {
    try {
      handler(state, { input: {
        function: func,
        tweet: 'Tweet 1',
        tweetUsername: 1,
        tweetPhoto: 'https://pbs.twimg.com/profile_images/3240741454/9080e76653a80e43ae2058432bc76806_400x400.jpeg',
        tweetCreated: 1234567890,
        tweetLink: 'https://twitter.com/BiIIMurray/status/437367711723978752'
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].tweet).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should fail, tweetPhoto format not recognized', () => {
    try {
      handler(state, { input: {
        function: func,
        tweet: 'Tweet 1',
        tweetUsername: '@ECWireless',
        tweetPhoto: 123,
        tweetCreated: 1234567890,
        tweetLink: 'https://twitter.com/BiIIMurray/status/437367711723978752'
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].tweet).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should fail, tweetCreated format not recognized', () => {
    try {
      handler(state, { input: {
        function: func,
        tweet: 'Tweet 1',
        tweetUsername: '@ECWireless',
        tweetPhoto: 'https://pbs.twimg.com/profile_images/3240741454/9080e76653a80e43ae2058432bc76806_400x400.jpeg',
        tweetCreated: '1234567890',
        tweetLink: 'https://twitter.com/BiIIMurray/status/437367711723978752'
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].tweet).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should fail, tweetLink format not recognized', () => {
    try {
      handler(state, { input: {
        function: func,
        tweet: 'Tweet 1',
        tweetUsername: '@ECWireless',
        tweetPhoto: 'https://pbs.twimg.com/profile_images/3240741454/9080e76653a80e43ae2058432bc76806_400x400.jpeg',
        tweetCreated: 1234567890,
        tweetLink: 123
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].tweet).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });
});

describe('Stake on market', () => {
  const func = 'stake';

  it('should fail, id is not a string', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 123,
        cast: 'yay',
        stakedAmount: 200
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked[0].address).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should fail, stakedAmount is not an integer', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
        cast: 'yay',
        stakedAmount: '200'
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked[0].address).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should fail, staker does not have high enough balance', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
        cast: 'yay',
        stakedAmount: 10000000
      }, caller: addresses.admin });

      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked[addresses.admin].address).toBe(undefined);
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should stake tokens on yay', () => {
    handler(state, { input: {
      function: func,
      id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
      cast: 'yay',
      stakedAmount: 1000
    }, caller: addresses.admin });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked[addresses.admin].address).toBe('XacJBWnPmWEHUixZepCPGc-DJD7jDn1CiZ99UAKpkIk');
  });

  it('should allow double-staking on yay', () => {
    handler(state, { input: {
      function: func,
      id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
      cast: 'yay',
      stakedAmount: 1000
    }, caller: addresses.admin });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked[addresses.admin].amount).toBe(2000);
  });

  it('should allow separate address staking on yay', () => {
    handler(state, { input: {
      function: func,
      id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
      cast: 'yay',
      stakedAmount: 2000
    }, caller: 'O6SGGaUbSm72rQO-9A7SGFUIGOiSy8Uih1-zbQmufaU' });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked['O6SGGaUbSm72rQO-9A7SGFUIGOiSy8Uih1-zbQmufaU'].amount).toBe(2000);
  });

  it('should fail, cannot stake both yes and no', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
        cast: 'nay',
        stakedAmount: 200
      }, caller: addresses.admin });
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('should stake tokens on nay', () => {
    handler(state, { input: {
      function: func,
      id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
      cast: 'nay',
      stakedAmount: 2000
    }, caller: 'aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA' });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked['aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA'].address).toBe('aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA');
  });

  it('should allow double-staking on nay', () => {
    handler(state, { input: {
      function: func,
      id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
      cast: 'nay',
      stakedAmount: 1000
    }, caller: 'aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA' });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].staked['aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA'].amount).toBe(3000);
  });
});

describe('Disburse market funds', () => {
  const func = 'disburse';

  it('Should fail, market has not passed necessary block height', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
      }, caller: addresses.admin });
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('Should fail, market doesn\'t exist', () => {
    try {
      swGlobal.block.increment(2160);
      handler(state, { input: {
        function: func,
        id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI9',
      }, caller: addresses.admin });
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('Should change status to "passed"', () => {

    handler(state, { input: {
      function: func,
      id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8',
    }, caller: addresses.admin });

    expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].status).toBe('passed');
  });

  it('Should fail, market has already passed', () => {
    try {
      handler(state, { input: {
        function: func,
        id: 'kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI9',
      }, caller: addresses.admin });
      
      expect(state.markets['kQIqCHRXi2CliXyhr6DrzfiemtEBmLQzoh3R1DX7yI8'].status).toBe('passed');
    } catch (err) {
      expect(err.name).toBe('ContractError');
    }
  });

  it('Should tip all token holders', () => {
      expect(state.balances['KWn-0l96Ss_lHheS1cjDY5N-94SHyxAQO8Wfy1ehPu0']).toBe(2499917);
  });

  // it('Should return all funds during tie', () => {
  //   expect(state.balances['aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA']).toBe(2498900);
  // });

  it('Should give correct funds to yay winners', () => {
    expect(state.balances['O6SGGaUbSm72rQO-9A7SGFUIGOiSy8Uih1-zbQmufaU']).toBe(2500442);
  });

  it('Should give correct funds to nay losers', () => {
    expect(state.balances['aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA']).toBe(2499099);
  });

  it('Should keep total supply at 10,000,000', () => {
    let allBalances = 0;
    Object.keys(state.balances).forEach(balance => {
      return allBalances += state.balances[balance];
    })
    expect(allBalances).toBe(9998800);
  })

    // it('Should give correct funds to nay winners', () => {
    //   expect(state.balances['aYFm9TP2G0_gVmzn-lCuYPlg2_Cpksq5VBBFEvDoOxA']).toBe(10000900);
    // });

    // it('Should give correct funds to yay losers', () => {
    //   expect(state.balances['O6SGGaUbSm72rQO-9A7SGFUIGOiSy8Uih1-zbQmufaU']).toBe(9999700);
    // });
});

9997017
