git clone https://github.com/euler-xyz/euler-contracts

cd euler-contracts
npm i

npx hardhat compile

cd ..

mv ./euler-contracts/addresses ./

mv ./euler-contracts/artifacts/contracts ./

rm -rf euler-contracts

git pull
git add .

dt = $(date '+%d/%m/%Y')
git commit -m "Generated Abis on $dt"

git push