import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
    TupleBuilder,
    TupleReader,
    Slice,
    Builder,
} from '@ton/core';

/*
owner: Address.parse("EQD4gS-Nj2Gjr2FYtg-s3fXUvjzKbzHGZ5_1Xe_V0-GCp0p2"),
name: "MyJetton",
symbol: "JET1",
image: "https://www.linkpicture.com/q/download_183.png", // Image url
description: "My jetton",
*/

export type JettonMinterConfig = {
    admin_address: Address;
    tokenContent: Cell;
    walletCode: Cell;
    treasury: Address;
};

export function JettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(0) // total_supply
        .storeAddress(config.admin_address)
        .storeRef(config.tokenContent)
        .storeRef(config.walletCode)
        .endCell();
}

export function mintBody(owner: Address, jettonAmount: bigint, transferToJWallet: bigint, queryId?: number): Cell {
    return beginCell()
        .storeUint(Opcodes.Mint, 32)
        .storeUint(queryId ?? 0, 64) // queryid
        .storeAddress(owner)
        .storeCoins(transferToJWallet)
        .storeRef(
            // internal transfer message
            beginCell()
                .storeUint(Opcodes.InternalTransfer, 32)
                .storeUint(queryId ?? 0, 64)
                .storeCoins(jettonAmount)
                .storeAddress(null)
                .storeAddress(owner)
                .storeCoins(toNano(0.001))
                .storeBit(false) // forward_payload in this slice, not separate cell
                .endCell(),
        )
        .endCell();
}

export const Opcodes = {
    Mint: 0x15,
    InternalTransfer: 0x178d4519,
};

export type JettonInitial = {
    $$type: 'JettonInitial';
    treasury: Address;
    minting_info: Cell;
    token_content: Cell;
};

export function storeJettonInitial(src: JettonInitial) {
    return (builder: Builder) => {
        let b_0 = builder;
        b_0.storeUint(2412644301, 32);
        b_0.storeAddress(src.treasury);
        b_0.storeRef(src.minting_info);
        b_0.storeRef(src.token_content);
    };
}

export type TokenBurnNotification = {
    $$type: 'TokenBurnNotification';
    query_id: bigint;
    amount: bigint;
    response_destination: Address;
};

export function storeTokenBurnNotification(src: TokenBurnNotification) {
    return (builder: Builder) => {
        let b_0 = builder;
        b_0.storeUint(2078119902, 32);
        b_0.storeUint(src.query_id, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.response_destination);
    };
}

export function loadEventMintRecord(slice: Slice) {
    let sc_0 = slice;
    if (sc_0.loadUint(32) !== 2279359072) {
        throw Error('Invalid prefix');
    }
    let _minter = sc_0.loadAddress();
    let _mintAmount = sc_0.loadCoins();
    let _lastMintTimestamp = sc_0.loadUintBig(32);
    let _mintRate = sc_0.loadUintBig(32);
    return {
        $$type: 'EventMintRecord' as const,
        minter: _minter,
        mintAmount: _mintAmount,
        lastMintTimestamp: _lastMintTimestamp,
        mintRate: _mintRate,
    };
}

export class Jetton implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Jetton(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = JettonMinterConfigToCell(config);
        const init = { code, data };
        return new Jetton(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            to: Address;
            amount: bigint;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: mintBody(opts.to, opts.amount, opts.value, opts.queryID),
        });
    }

    async send(
        provider: ContractProvider,
        via: Sender,
        args: { value: bigint; bounce?: boolean | null | undefined },
        message: JettonInitial | string | 'Owner Claim' | 'Mint' | TokenBurnNotification,
    ) {
        let body: Cell | null = null;
        if (
            message &&
            typeof message === 'object' &&
            !(message instanceof Slice) &&
            message.$$type === 'JettonInitial'
        ) {
            body = beginCell().store(storeJettonInitial(message)).endCell();
        }
        if (typeof message === 'string') {
            body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
        }
        if (message === 'Owner Claim') {
            body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
        }
        if (message === 'Mint') {
            body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
        }
        if (
            message &&
            typeof message === 'object' &&
            !(message instanceof Slice) &&
            message.$$type === 'TokenBurnNotification'
        ) {
            body = beginCell().store(storeTokenBurnNotification(message)).endCell();
        }
        if (body === null) {
            throw new Error('Invalid message type');
        }

        await provider.internal(via, { ...args, body: body });
    }

    async getJettonData(provider: ContractProvider) {
        const result = await provider.get('get_jetton_data', []);
        let totalSupply = result.stack.readBigNumber();
        let mintable = result.stack.readBoolean();
        let adminAddress = result.stack.readAddress();
        let content = result.stack.readCell();
        let walletCode = result.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }

    async getWalletAddress(provider: ContractProvider, owner: Address) {
        const result = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return result.stack.readAddress();
    }
}
