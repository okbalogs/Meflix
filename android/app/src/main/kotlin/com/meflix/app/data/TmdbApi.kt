package com.meflix.app.data

import com.meflix.app.data.model.TmdbGenreListResponse
import com.meflix.app.data.model.TmdbMovie
import com.meflix.app.data.model.TmdbSearchResponse
import com.meflix.app.data.model.TmdbTvShow
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query

private const val TMDB_BASE_URL = "https://api.themoviedb.org/3/"

interface TmdbApi {

    @GET("search/movie")
    suspend fun searchMovie(
        @Query("api_key") apiKey: String,
        @Query("query") query: String,
        @Query("page") page: Int = 1,
        @Query("language") language: String = "en-US"
    ): Response<TmdbSearchResponse<TmdbMovie>>

    @GET("search/tv")
    suspend fun searchTv(
        @Query("api_key") apiKey: String,
        @Query("query") query: String,
        @Query("page") page: Int = 1,
        @Query("language") language: String = "en-US"
    ): Response<TmdbSearchResponse<TmdbTvShow>>

    @GET("genre/movie/list")
    suspend fun getMovieGenres(
        @Query("api_key") apiKey: String,
        @Query("language") language: String = "en-US"
    ): Response<TmdbGenreListResponse>

    @GET("genre/tv/list")
    suspend fun getTvGenres(
        @Query("api_key") apiKey: String,
        @Query("language") language: String = "en-US"
    ): Response<TmdbGenreListResponse>

    companion object {
        const val IMAGE_BASE_W500 = "https://image.tmdb.org/t/p/w500"
        const val IMAGE_BASE_ORIGINAL = "https://image.tmdb.org/t/p/original"

        fun posterUrl(path: String): String = "$IMAGE_BASE_W500$path"
        fun backdropUrl(path: String): String = "$IMAGE_BASE_ORIGINAL$path"

        fun create(): TmdbApi = Retrofit.Builder()
            .baseUrl(TMDB_BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(TmdbApi::class.java)
    }
}
