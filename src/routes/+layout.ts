import { redirect } from '@sveltejs/kit';
import { PERMANENT_REDIRECTS } from '../redirects';

export async function load({ url }) {
	const pathname = url.pathname;

	if (PERMANENT_REDIRECTS.hasOwnProperty(pathname)) {
		return redirect(308, (PERMANENT_REDIRECTS as any)[pathname]);
	}
}
