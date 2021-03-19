Latest deployment: `4BM86e-zd_XBSY4nFFH3Kz_9GY2jkcEmnxe7CKqONIw`

# Community Contract Specs

[![Gitopia](https://img.shields.io/endpoint?style=&url=https://gitopia.org/mirror-badge.json)](https://gitopia.org/?#/BPr7vrFduuQqqVMu_tftxsScTKUq9ke0rx4q5C9ieQU/community-contract)

Community is a frontend, library (in Javascript) and a SmartWeave contract, to create new communities completely decentralized. 

These are the contract's specs.

**Holders** = Community token holders/participants.

The community state has the following default structure:
```typescript
{
  name: string,
  ticker: string,
  balances: {
    [key: string]: number // Positive integer
  },
  vault: {
    [key: string]: [{
      balance: number, // Positive integer
      end: number, // At what block the lock ends.
      start: number // At what block the lock starts.
    }]
  },
  votes: VoteInterface[], 
  markets: MarketInterface,
  roles: {
      [key: string]: string
  },
  settings: [ // Array of a Map<string, any>
      ["quorum", number], // quorum is between 0.01 and 0.99
      ["support", number], // between 0.01-0.99, how much % yays for a proposal to be approved
      ["voteLength", number], // How many blocks to leave a proposal open
      ["lockMinLength", number], // Minimum lockLength allowed
      ["lockMaxLength", number] // Maximum lockLength allowed
  ],
  logs: [] // Simple logging array to assist development
}
```

Here's an example of what the state when creating the contract should look like:
```json
{
  "name": "Community",
  "ticker": "COMM",
  "balances": {
    "BPr7vrFduuQqqVMu_tftxsScTKUq9ke0rx4q5C9ieQU": 10000000
  },
  "vault": {},
  "votes": [],
  "markets": {
    "2uvJ0-PWEMNYRLYIH32VDDDyiSD6BIZ5aJBWYXYfWks": {
      "marketId": "2uvJ0-PWEMNYRLYIH32VDDDyiSD6BIZ5aJBWYXYfWks",
      "start": 616834,
      "status": "active",
      "tweet": "This is my tweet",
      "tweetUsername": "@ecwireless",
      "tweetPhoto": "photo/link.png",
      "tweetCreated": 098209,
      "tweetLink": "www.twitter.com/tweet/link",
      "yays": 5000,
      "nays": 0,
      "staked": {
        "XacJBWnPmWEHUixZepCPGc-DJD7jDn1CiZ99UAKpkIk": {
          "address": "XacJBWnPmWEHUixZepCPGc-DJD7jDn1CiZ99UAKpkIk",
          "amount": 5000,
          "cast": "yay"
        }
      }
    }
  },
  "roles": {},
  "settings": [
      ["quorum", 0.5],
      ["voteLength", 2160],
      ["lockMinLength", 100],
      ["lockMaxLength", 2160]
  ]
}
```

**VoteInterface** is:
```typescript
interface VoteInterface {
  status?: 'active' | 'quorumFailed' | 'passed' | 'failed';
  type?: 'mint' | 'mintLocked' | 'burnVault' | 'indicative' | 'set';
  id?: number;
  totalWeight?: number;
  recipient?: string;
  target?: string;
  qty?: number;
  key?: string;
  value?: any;
  note?: string;
  yays?: number;
  nays?: number;
  voted?: string[];
  start?: number;
  lockLength?: number;
}
```

**MarketInterface** is:
```typescript
interface MarketInterface {
  marketId?: string;
  start?: number;
  status?: 'active' | 'passed' | 'failed';
  yays?: number;
  nays?: number;
  staked?: StakedInterface[];
  tweet?: string;
  tweetUsername?: string;
  tweetPhoto?: string;
  tweetCreated?: number;
  tweetLink?: string;
}
```

### Transfer
Holders are able to transfer them to someone else on Arweave, not only to other Community members but to anyone else.
#### Requires: 
- **target**: To whom the balance is going to be transfered.
- **qty**: How many tokens to transfer.

#### Returns:
`{ state }`

### TransferLocked
Holders are able to transfer tokens and lock them at the same time, to someone else on Arweave.
#### Requires:
- **target**: To whom the balance is going to be transfered.
- **qty**: How many tokens to transfer.
- **lockLength**: How many blocks *qty* will be locked.

#### Returns:
`{state}`

### Balance
Check the current total balance (unlocked and in vault) of an account.

#### Optional:
- **target**: To whom check the balance. If not provided, caller is used.

#### Returns:
```
result: {
    target: address,
    balance: target's balance
}
```

### UnlockedBalance
Check the current unlocked balance of an account.

#### Optional:
- **target**: To whom check the balance. If not provided, caller is used.

#### Returns:
```
result: {
    target: address,
    balance: target's balance
}
```

## Locking System

### Lock
Lock a balance to increase it's vote weight on the Community. The voting weight is: `lockedBalance * (end - start)`.

#### Requires:
- **qty**: Balance amount to lock.
- **lockLength**: How many blocks *qty* will be locked.

#### Returns:
`{ state }`

### Unlock
Unlock all locked balances that are over the *end* set while locking.

#### Returns:
`{ state }`

### IncreaseVault
Increase a locked balance lockedLength.

#### Requires:
- **id**: The vault ID to be locked longer.
- **lockLength**: How many more blocks this vault will be locked.

### VaultBalance
Check the current locked balance of an account.

#### Optional:
- **target**: To whom check the balance. If not provided, caller is used.

#### Returns:
```
result: {
    target: address,
    balance: target's total locked balance
}
```

## Voting System

### Propose
Holders are able to propose a new vote, this will create a new proposal.

#### Requires:
**type**: Vote type. One of the following:

- **Mint**
  To mint tokens to an Arweave address.
  Requires:
  - **recipient**: Arweave address recipient
  - **qty**: Amount of tokens to mint
  - **note**: Proposal description
- **MintLocked**
  To mint locked tokens to an Arweave address.
  - **recipient**: Arweave address recipient
  - **qty**: Amount of tokens to mint
  - **note**: Proposal description
  - **lockLength**: How many blocks *qty* will be locked.
- **BurnVault**
  To burn a vault with it's tokens. Warning: This will completely remove all the tokens stored on the target's vault.
  - **target**: Arweave address target
- **Set**
  To update the Community settings.
  Requires:
  - **key**: Setting key
  - **value**: Setting value
- **Indicative**
  To send a general non-fixed proposal. A yes/no question.
  Requires:
  - **note**: Proposal description

Allowed keys for **set** are:
- quorum
- support
- lockMinLength
- lockMaxLength
- role
  - role value must be: `{target: address, role: 'name'}`
- Custom Key/Value pairs

#### Returns:
`{ state }`

### CreateMarket
Holders are able to create a new assertion market.
#### Requires:
- **tweet**: The tweet text.
- **tweetUsername**: Username of the user tweeting.
- **tweetPhoto**: Photo of the user tweeting.
- **tweetCreated**: Timestamp of when the tweet was created.
- **tweetLink**: Link to the tweet.

#### Returns:
`{ state }`

### Vote
Cast a vote on one of the proposals.

#### Requires:
- **id**: Proposal ID.
- **cast**: What vote are you casting `'yay' || 'nay'`.

#### Returns:
`{ state }`

### Stake
Cast and stake on one of the markets.

#### Requires:
- **id**: Market ID.
- **amount**: Amount of the token you are staking.
- **cast**: What vote are you casting `'yay' || 'nay'`.

#### Returns:
`{ state }`

### Finalize
After a vote is concluded, we should call finalize to make it in effect. It will update the vote status to `passed`, and execute if needed, or `failed`.

#### Requires:
- **id**: Proposal ID.

#### Returns:
`{ state }`

### Disburse
After a market is concluded, we should call disburse to make it in effect, and payout the winners. It will update the market status to `passed`, and execute if needed, or `failed`. It will also return stake amounts to the winners, as well as divide the losers' stake amounts amongst the winners.

#### Requires:
- **id**: Market ID.

#### Returns:
`{ state }`
