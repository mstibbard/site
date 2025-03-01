import { redirect } from '@sveltejs/kit';
import { PERMANENT_REDIRECTS } from '../redirects';

export async function load({ url }) {
	const pathname: string = url.pathname;

	if (Object.prototype.hasOwnProperty.call(PERMANENT_REDIRECTS, pathname)) {
		return redirect(308, PERMANENT_REDIRECTS[pathname as keyof typeof PERMANENT_REDIRECTS]);
	}
}
