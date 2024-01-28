import {
    Blockchain,
    SandboxContract,
    TreasuryContract,
    printTransactionFees,
    prettyLogTransactions,
} from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

// import { JettonWallet } from '@ton/ton';
import { Minter, CreateJettonRoot } from '../wrappers/Minter';
import { Jetton } from '../wrappers/Jetton';
import { JettonWallet } from '../wrappers/JettonWallet';

describe('Sample', () => {
    let jettonRootCode: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        jettonRootCode = await compile('Jetton');
        jettonWalletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;

    let minter: SandboxContract<Minter>;
    let jetton: SandboxContract<Jetton>;
    let jettonWallet: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');

        minter = blockchain.openContract(await Minter.fromInit(deployer.address, jettonRootCode));

        let init_data = beginCell()
            .storeCoins(1000000n) // Total Supply
            .storeAddress(admin.address)
            .storeRef(beginCell().endCell())
            .storeRef(jettonWalletCode)
            .endCell();
        let createJettonParam: CreateJettonRoot = { $$type: 'CreateJettonRoot', query_id: 0n, init_data: init_data };
        const deployResult = await minter.send(deployer.getSender(), { value: toNano(1) }, createJettonParam);
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minter.address,
            deploy: true,
            success: true,
        });

        // printTransactionFees(deployResult.transactions);
        // prettyLogTransactions(deployResult.transactions);

        let getJettonAddr = await minter.getGetAddressByIndex(0n);

        jetton = blockchain.openContract(await Jetton.createFromAddress(getJettonAddr));
        //     {
        //         admin_address: admin.address,
        //         tokenContent: beginCell().storeRef(beginCell().endCell()).storeRef(jettonWalletCode).endCell(),
        //         walletCode: jettonWalletCode,
        //         treasury: deployer.address,
        //     },
        //     await compile('Jetton'),
        // ),
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and sample are ready to use

        let getLatestId = await minter.getGetIndex();
        expect(getLatestId).toBeGreaterThan(0n);

        console.log(jetton.address);
    });

    it('Create Tx ', async () => {
        // let getLatestId = await minter.getGetIndex();
        // let getJettonAddr = await minter.getGetAddressByIndex(getLatestId);

        const mintResult = await minter.send(
            deployer.getSender(),
            { value: toNano(1) },
            {
                $$type: 'Mint',
                index: 0n,
                mintAmount: 20000n,
            },
        );
        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minter.address,
            success: true,
        });

        let data = await jetton.getJettonData();
        console.log(data.totalSupply);

        // let getJettonWallet = await jetton.getWalletAddress(deployer.address);
        // let jettonWallet = blockchain.openContract(await JettonWallet.createFromAddress(getJettonWallet));
        // let getBalance = await jettonWallet.getBalance();
        // console.log(getBalance);
    });
});
