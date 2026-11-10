import { requireOptionalNativeModule } from 'expo';

export type Scan = { id: string; name: string; date: string; triangles: number; uri: string };
type Scanner = {
  isSupported(): boolean;
  scan(width: number, depth: number, height: number): Promise<Scan | null>;
  listScans(): Promise<Scan[]>;
  share(id: string): Promise<void>;
  preview(id: string): Promise<void>;
};
export default requireOptionalNativeModule<Scanner>('CountertopScanner');
