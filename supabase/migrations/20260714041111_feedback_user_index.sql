-- The "read own feedback" policy filters on user_id, and deleting an account cascades
-- through this foreign key — both would otherwise scan the whole table. Every other table
-- in the schema indexes its owner column; this one was missed.
create index feedback_user_id_idx on public.feedback (user_id);
