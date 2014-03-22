var gulp = require('gulp'),
	sass = require('gulp-sass');

gulp.task('css', function() {
	gulp.src('static/hah.scss')
		.pipe(sass())
		.pipe(gulp.dest('static'));
});

gulp.task('watch', function() {
	gulp.watch('static/hah.scss', ['css']);
});