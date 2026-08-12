/**
 * Domain owner resolved at the server boundary.  It intentionally contains no
 * client supplied values: callers receive it only from requireCurrentUser().
 */
export interface OwnerContext {
  userId: string;
}
