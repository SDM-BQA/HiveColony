import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: '🐝 Hive Colony — can this community keep its colony alive?',
  });
};
