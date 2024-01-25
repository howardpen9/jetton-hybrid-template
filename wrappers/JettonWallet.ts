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
} from '@ton/core';

export type JettonWalletConfig = {
    balance: bigint;
    ownerAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
};

export function JettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.jettonMasterAddress)
        .storeRef(config.jettonWalletCode)
        .storeUint(0, 32)
        .endCell();
}

export function transfer(to: Address, from: Address, jettonAmount: bigint, queryID?: number, forwardPayload?: Cell) {
    let cell = beginCell()
        .storeUint(Opcodes.transfer, 32)
        .storeUint(queryID ?? 0, 64)
        .storeCoins(jettonAmount)
        .storeAddress(to)
        .storeAddress(from)
        .storeBit(false)
        .storeCoins(toNano(0.001));
    if (forwardPayload == undefined) {
        return cell.storeBit(false).endCell();
    } else {
        return cell
            .storeBit(true) // forward_payload in this slice, not separate cell
            .storeRef(forwardPayload)
            .endCell();
    }
}

export function burn(jettonAmount: bigint, response_address: Address, queryID?: number) {
    let cell = beginCell()
        .storeUint(Opcodes.burn, 32)
        .storeUint(queryID ?? 0, 64)
        .storeCoins(jettonAmount)
        .storeAddress(response_address)
        .endCell();
    return cell;
}

export const Opcodes = {
    transfer: 0xf8a7ea5,
    burn: 0x595f07bc,
};

export class JettonWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = JettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            from: Address;
            to: Address;
            amount: bigint; // token amount
            queryID?: number;
            forwardPayload?: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: transfer(opts.to, opts.from, opts.amount, opts.queryID, opts.forwardPayload),
        });
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            from: Address;
            amount: bigint;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: burn(opts.amount, opts.from, opts.queryID),
        });
    }

    async getBalance(provider: ContractProvider) {
        const state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        const result = await provider.get('get_wallet_data', []);
        return result.stack.readBigNumber();
    }

    async getUnlockTime(provider: ContractProvider) {
        const state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        const result = await provider.get('get_unlocked_time', []);
        return result.stack.readNumber();
    }
}
