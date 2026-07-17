import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// ZAINEX_MULTI_USER_GOOGLE_AUTH_V1

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
};

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  pages: {
    signIn: "/auth",
    error: "/auth",
  },
  callbacks: {
    async signIn({
      account,
      profile,
      user,
    }) {
      const google =
        profile as GoogleProfile | undefined;

      const email = (
        google?.email ??
        user.email ??
        ""
      )
        .trim()
        .toLowerCase();

      return (
        account?.provider === "google" &&
        google?.email_verified === true &&
        email.length > 0
      );
    },
  },
});
