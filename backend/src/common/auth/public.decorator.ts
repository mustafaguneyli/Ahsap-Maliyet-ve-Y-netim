import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Guard bu handler'ı token kontrolünden çıkarır. Yalnız gerçekten public uçlar için. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
