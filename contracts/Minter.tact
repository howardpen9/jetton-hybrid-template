message CreateJettonRoot {
    query_id: Int as uint64;
    init_data: Slice;
}

message(0x0000016) JettonInit {
    query_id: Int as uint64;
    to_address: Address;
}

message Mint {
    index: Int as uint32;
    mintAmount: Int as coins;
}

message(0x0000015) MintMessage {
    queryId: Int as uint64;
    toAddress: Address;
    forward_ton_amount: Int as coins;
    messageBody: Cell;
}

contract Minter {

    owner: Address;
    jettonRootCode: Cell;
    index: Int as uint32 = 0;
    record: map<Int, Address>;

    init(owner: Address, jettonRootCode: Cell) {
        self.owner = owner;
        self.jettonRootCode = jettonRootCode;
    }

    receive(msg: CreateJettonRoot) {
        let initCode: StateInit = self.JettonRootInit(msg.init_data.asCell());
        self.record.set(self.index, contractAddress(initCode));
        self.index = self.index + 1;
        send(SendParameters{
            to: contractAddress(initCode),
            value: 0,
            mode: 64, 
            bounce: false,
            body: JettonInit {
                query_id: msg.query_id,
                to_address: sender()
            }.toCell(),
            code: initCode.code,
            data: initCode.data
        });        
    }

    receive(msg: Mint) {
        require(context().value >= ton("0.15"), "not enough money");
        let masterMessage: Cell = beginCell()
                                    .storeUint(395134233, 32)       // opCode(0x178d4519) - InternalTransfer
                                    .storeUint(0, 64)               // queryId
                                    .storeCoins(msg.mintAmount)     // Mint Amount
                                    .storeAddress(myAddress())      // from_address
                                    .storeAddress(sender())         // response -> excesses
                                    .storeCoins(1)                  // forward_ton_amount
                                    .storeBool(false)               // isHaving the Custom_payload
                                .endCell();

        send(SendParameters{
            to: self.record.get(msg.index)!!,
            value: 0,
            bounce: true,
            mode: SendRemainingValue,
            body: MintMessage { // 0x0000015
                queryId: 0,
                toAddress: sender(), 
                forward_ton_amount: ton("0.15"), 
                messageBody: masterMessage
            }.toCell()
        });
    }

    fun JettonRootInit(initData: Cell): StateInit {
        let data: Cell = initData;
        let rootInit: StateInit = StateInit { data: data, code: self.jettonRootCode }; 
        return rootInit;
    }

    get fun get_address_by_index(index: Int): Address {
        return self.record.get(index)!!;
    }
}