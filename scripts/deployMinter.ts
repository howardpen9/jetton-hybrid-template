import { beginCell, toNano } from '@ton/core';
import { Mint, Minter } from '../wrappers/Minter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const minter = provider.open(await Minter.fromInit(provider.sender().address!!, await compile('Jetton')));

    let init_data = beginCell()
        .storeCoins(1000000n) // Total Supply
        .storeAddress(provider.sender().address!!)
        .storeRef(beginCell().endCell())
        .storeRef(await compile('JettonWallet'))
        .endCell();

    await minter.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'CreateJettonRoot',
            query_id: 0n,
            init_data: init_data,
        },
    );

    await provider.waitForDeploy(minter.address);

    console.log('ID', await minter.getGetIndex());
}
