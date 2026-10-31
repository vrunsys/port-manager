import { DarwinAdapter } from './darwin/darwin-adapter';
import { LinuxAdapter } from './linux/linux-adapter';
import { PlatformAdapter } from '../port-types';
import { WindowsAdapter } from './windows/windows-adapter';

const ADAPTER_FACTORIES: Partial<Record<NodeJS.Platform, () => PlatformAdapter>> = {
	linux: () => new LinuxAdapter(),
	darwin: () => new DarwinAdapter(),
	win32: () => new WindowsAdapter(),
};

export function createPlatformAdapter(platform: NodeJS.Platform = process.platform): PlatformAdapter {
	const create = ADAPTER_FACTORIES[platform];
	if (!create) {
		throw new Error(`Port Manager does not support "${platform}" yet.`);
	}
	return create();
}
