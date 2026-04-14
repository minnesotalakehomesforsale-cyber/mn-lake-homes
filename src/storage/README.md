# File Storage Strategy

This directory (`src/storage`) is intentionally partitioned as the physical drop zone for MVP file uploads (e.g., Profile Avatars, Brokerage Logos).

### Phase 1 Rules:
- The database schema handles image locations as explicit URLs (`profile_image_url`).
- In Phase 1, these fall back to generative standard UI initials (e.g., 'DC' for David Chen).
- **Upload Deferred Architecture**: When the team activates file uploading in a subsequent launch phase, we will map a `multer` Express interceptor to pipe binaries into this `/storage` partition, ensuring the `profile_image_url` maps natively to `/api/media/:filename`. 

For Production scalability (e.g. Heroku, Railway, AWS elastic beanstalk where local storage is ephemeral), we recommend ripping `multer` block-writes and mapping an AWS S3 bucket instead to preserve states securely across server resets.
