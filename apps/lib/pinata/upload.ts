import { PinataSDK } from 'pinata';

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud',
});

export async function uploadImageToIPFS(file: File): Promise<string> {
  const result = await pinata.upload.public.file(file);
  return result.cid;
}

export function getIPFSUrl(hash: string): string {
  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud';
  return `${gateway}/ipfs/${hash}`;
}
