// Tambahkan dotenv untuk membaca file .env
import dotenv from "dotenv";
dotenv.config();

import { KeyPair, keyStores, connect, Near } from "near-api-js";
import { Twisters } from "twisters";
import BigNumber from "bignumber.js";
import { mainnetConfig } from "./rpc.js";

// Baca konfigurasi dari .env
const accountId = process.env.ACCOUNT_ID; // Account ID
const privateKey = process.env.PRIVATE_KEY; // Private key
const claimInterval = parseFloat(process.env.CLAIM_INTERVAL) || 1; // Default 1 jam jika tidak diatur

const near = new Near(mainnetConfig);
const twisters = new Twisters();

const getAccount = (accountId, privateKey) =>
  new Promise(async (resolve, reject) => {
    try {
      const keyStore = new keyStores.InMemoryKeyStore();
      const keyPair = KeyPair.fromString(privateKey);
      await keyStore.setKey(mainnetConfig.networkId, accountId, keyPair);

      const connectionConfig = {
        deps: {
          keyStore,
        },
        ...mainnetConfig,
      };

      const accountConnection = await connect(connectionConfig);
      const account = await accountConnection.account(accountId);

      resolve(account);
    } catch (error) {
      reject(error);
    }
  });

const getNearBalance = async (accountId, privateKey) => {
  const account = await getAccount(accountId, privateKey);
  const NearBalance = await account.getAccountBalance();
  return new BigNumber(NearBalance.total).dividedBy(1e24);
};

const processAccount = async (accountId, privateKey, delayInHours) => {
  while (true) {
    try {
      const mineAndUpdate = async () => {
        const NearBalanceUser = await getNearBalance(accountId, privateKey);

        twisters.put(accountId, {
          text: `
Account ID : ${accountId}
Near Balance : ${NearBalanceUser}
Status : Claiming...
`,
        });

        let transactionHash = null;
        while (transactionHash == null) {
          try {
            const account = await getAccount(accountId, privateKey);
            const callContract = await account.functionCall({
              contractId: "game.hot.tg",
              methodName: "claim",
              args: {},
            });

            transactionHash = callContract.transaction.hash;

            twisters.put(accountId, {
              text: `
      Account ID : ${accountId}
      Near Balance : ${NearBalanceUser}
      Status : Claimed ${callContract.transaction.hash}...
      `,
            });
            await new Promise((resolve) => setTimeout(resolve, 5000));
            twisters.put(accountId, {
              active: false,
              removed: true,
              text: `
      Account ID : ${accountId}
      Near Balance : ${NearBalanceUser}
      Status : Claimed ${callContract.transaction.hash}...
      `,
            });
          } catch (contractError) {
            twisters.put(accountId, {
              text: `
      Account ID : ${accountId}
      Near Balance : ${NearBalanceUser}
      Status : ${contractError}...
      `,
            });
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        // Hitung jam, menit, dan detik untuk delay
        const totalMilliseconds = delayInHours * 3600 * 1000 + 5 * 60 * 1000; // Tambahkan 5 menit tambahan
        let remainingTime = totalMilliseconds;

        // Update status setiap detik
        while (remainingTime > 0) {
          const hours = Math.floor(remainingTime / (3600 * 1000)); // Total jam
          const minutes = Math.floor((remainingTime % (3600 * 1000)) / (60 * 1000)); // Sisa menit
          const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000); // Sisa detik

          twisters.put(accountId, {
            text: `
  Account ID : ${accountId}
  Near Balance : ${NearBalanceUser}
  Status : Mining for ${hours} Hours ${minutes} Minutes ${seconds} Seconds...
  `,
          });

          // Kurangi waktu yang tersisa
          remainingTime -= 1000; // Kurangi 1 detik
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Tunggu 1 detik
        }

        // Setelah selesai menunggu, lanjutkan ke proses berikutnya
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Tambahkan waktu tunggu tambahan jika diperlukan
      };

      await mineAndUpdate();
    } catch (error) {
      twisters.put(accountId, {
        text: `
Account ID : ${accountId}
Status : ${error.message} - ${error.cause ?? ""}...
`,
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

// Jalankan fungsi dengan interval klaim dari .env
(async () => {
  await processAccount(accountId, privateKey, claimInterval);
})();
