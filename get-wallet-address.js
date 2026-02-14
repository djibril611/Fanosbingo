import { ethers } from 'ethers';

const privateKey = '29abb425e48e6eba76a5a4ba75a9f91190fbffc630c2f6139f2efbd9614afbe0';
const wallet = new ethers.Wallet(privateKey);

console.log('\n=================================');
console.log('WITHDRAWAL WALLET ADDRESS');
console.log('=================================');
console.log('Address:', wallet.address);
console.log('\nThis wallet needs BNB to process withdrawals.');
console.log('Please send BNB to this address on BSC network.');
console.log('=================================\n');
